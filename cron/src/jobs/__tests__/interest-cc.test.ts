/**
 * Tests for the credit card daily interest accrual job.
 *
 * Key behaviours under test:
 *  - Daily interest = |amount| × (APR / 100 / 365) per qualifying transaction
 *  - Grace period: when lastStatementPaidInFull=true, current-cycle purchases
 *    are exempt; prior-cycle purchases still accrue
 *  - When a transaction's linked APR rate is inactive, falls back to STANDARD
 *  - When no APR rate is available at all, that transaction is skipped (zero accrual)
 *  - On the last day of the month, an INTEREST_CHARGED transaction is posted
 *    and the account balance is decremented
 *  - Accounts with no EXPENSE transactions are skipped entirely
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ../db (relative to the job file, so ../../db from __tests__) ────────

vi.mock("../../db", () => {
  const txClient = {
    interestLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
  }
  return {
    prisma: {
      account: {
        findMany: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runCCInterestAccrual } from "../interest-cc"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap a plain number as a Decimal-shaped object that the job code can call
 * `.abs()`, `.div()`, `.mul()`, `.add()`, `.negated()`, `.isZero()`, `.toFixed()`
 * on — using real decimal.js under the hood so arithmetic is accurate. */
import Decimal from "decimal.js"

function decimal(n: number): Decimal {
  return new Decimal(n)
}

/** Returns a mock CreditCardDetails row. */
function makeCCDetails(overrides: {
  statementCloseDay?: number
  lastStatementPaidInFull?: boolean
} = {}) {
  return {
    accountId: "acc-1",
    statementCloseDay: overrides.statementCloseDay ?? 15,
    lastStatementPaidInFull: overrides.lastStatementPaidInFull ?? false,
    lastStatementBalance: decimal(-500),
    createdAt: new Date(),
    updatedAt: new Date(),
    creditLimit: decimal(5000),
    minimumPayment: decimal(25),
    paymentDueDay: 25,
    gracePeriodDays: 21,
  }
}

/** Returns a minimal EXPENSE transaction row. */
function makeTx(overrides: {
  id?: string
  amount?: number
  date?: Date
  aprRateId?: string | null
} = {}) {
  const amt = overrides.amount ?? -100
  return {
    id: overrides.id ?? "tx-1",
    accountId: "acc-1",
    userId: "user-1",
    date: overrides.date ?? new Date("2025-01-10T00:00:00.000Z"),
    amount: decimal(amt),
    type: "EXPENSE",
    description: "Test purchase",
    category: "Shopping",
    source: "MANUAL",
    notes: null,
    aprRateId: overrides.aprRateId ?? null,
    linkedTransactionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** Returns a minimal AprRate row. */
function makeAprRate(overrides: {
  id?: string
  apr?: number
  rateType?: string
  isActive?: boolean
} = {}) {
  return {
    id: overrides.id ?? "rate-1",
    accountId: "acc-1",
    userId: "user-1",
    rateType: overrides.rateType ?? "STANDARD",
    apr: decimal(overrides.apr ?? 24.99),
    isActive: overrides.isActive ?? true,
    expirationDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** Returns a mock credit card account. */
function makeCCAccount(overrides: {
  id?: string
  balance?: number
  ccDetails?: ReturnType<typeof makeCCDetails>
  aprRates?: ReturnType<typeof makeAprRate>[]
} = {}) {
  return {
    id: overrides.id ?? "acc-1",
    userId: "user-1",
    name: "Test Visa",
    balance: decimal(overrides.balance ?? -500),
    isActive: true,
    creditCardDetails: overrides.ccDetails ?? makeCCDetails(),
    aprRates: overrides.aprRates ?? [makeAprRate()],
  }
}

const mockPrismaAccountFindMany = vi.mocked(prisma.account.findMany)
const mockPrismaTxFindMany = vi.mocked(prisma.transaction.findMany)
const mockPrismaTransaction = vi.mocked(prisma.$transaction)
// Access the txClient stored on the mock
const txClient = (prisma as unknown as { _txClient: typeof prisma & {
  interestLog: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  transaction: { create: ReturnType<typeof vi.fn> }
  account: { update: ReturnType<typeof vi.fn> }
} })._txClient

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runCCInterestAccrual", () => {
  describe("when there are no active credit card accounts", () => {
    it("exits early without writing any records", async () => {
      mockPrismaAccountFindMany.mockResolvedValue([])

      await runCCInterestAccrual()

      expect(mockPrismaTxFindMany).not.toHaveBeenCalled()
      expect(mockPrismaTransaction).not.toHaveBeenCalled()
    })
  })

  describe("when an account has no EXPENSE transactions", () => {
    it("skips the account without writing an InterestLog entry", async () => {
      mockPrismaAccountFindMany.mockResolvedValue([makeCCAccount()] as never)
      mockPrismaTxFindMany.mockResolvedValue([])

      await runCCInterestAccrual()

      expect(mockPrismaTransaction).not.toHaveBeenCalled()
    })
  })

  describe("daily interest calculation", () => {
    it("calculates correct daily interest: |amount| × (APR / 100 / 365)", async () => {
      // Use a past date so it's definitely NOT in the current cycle
      // and lastStatementPaidInFull=false so all purchases accrue
      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [makeAprRate({ apr: 24.99 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -100, date: new Date("2025-01-10T00:00:00.000Z") }),
      ] as never)

      // Capture what InterestLog.create is called with
      let loggedAmount: Decimal | undefined
      txClient.interestLog.create.mockImplementation(async ({ data }: { data: { amount: Decimal } }) => {
        loggedAmount = data.amount
        return {}
      })
      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      expect(txClient.interestLog.create).toHaveBeenCalledOnce()

      // Expected: 100 × (24.99 / 100 / 365)
      const expected = new Decimal(100).mul(new Decimal(24.99).div(100).div(365))
      expect(loggedAmount!.toFixed(8)).toBe(expected.toFixed(8))
    })

    it("sums daily interest across multiple qualifying transactions", async () => {
      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [makeAprRate({ apr: 20 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ id: "tx-1", amount: -200, date: new Date("2025-01-05T00:00:00.000Z") }),
        makeTx({ id: "tx-2", amount: -300, date: new Date("2025-01-06T00:00:00.000Z") }),
      ] as never)

      let loggedAmount: Decimal | undefined
      txClient.interestLog.create.mockImplementation(async ({ data }: { data: { amount: Decimal } }) => {
        loggedAmount = data.amount
        return {}
      })
      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // 200 × (20/100/365) + 300 × (20/100/365) = 500 × (20/100/365)
      const rate = new Decimal(20).div(100).div(365)
      const expected = new Decimal(200).mul(rate).add(new Decimal(300).mul(rate))
      expect(loggedAmount!.toFixed(8)).toBe(expected.toFixed(8))
    })
  })

  describe("grace period", () => {
    it("skips current-cycle purchases when lastStatementPaidInFull is true", async () => {
      // statementCloseDay = 1; "today" in the job is real Date(), so we need
      // to craft a purchase date that is strictly AFTER the last statement close.
      // The job normalises today to midnight. We make the purchase "today" minus 1 day,
      // which for a closeDay=1 and today around mid-month puts the purchase in
      // the current cycle.
      const currentCycleDate = new Date()
      currentCycleDate.setDate(currentCycleDate.getDate() - 1) // yesterday (in current cycle)
      currentCycleDate.setHours(0, 0, 0, 0)

      const account = makeCCAccount({
        ccDetails: makeCCDetails({
          lastStatementPaidInFull: true,
          statementCloseDay: 1, // closed on the 1st, so current cycle starts from the 1st
        }),
        aprRates: [makeAprRate({ apr: 24.99 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -500, date: currentCycleDate }),
      ] as never)

      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // No interest should accrue → no InterestLog entry
      expect(txClient.interestLog.create).not.toHaveBeenCalled()
    })

    it("still charges interest on prior-cycle purchases even when lastStatementPaidInFull is true", async () => {
      // A purchase from well before the last statement close (3 months ago)
      const priorCycleDate = new Date()
      priorCycleDate.setMonth(priorCycleDate.getMonth() - 3)
      priorCycleDate.setHours(0, 0, 0, 0)

      const account = makeCCAccount({
        ccDetails: makeCCDetails({
          lastStatementPaidInFull: true,
          statementCloseDay: 1,
        }),
        aprRates: [makeAprRate({ apr: 24.99 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -200, date: priorCycleDate }),
      ] as never)

      txClient.interestLog.create.mockResolvedValue({})
      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // Prior-cycle purchase → interest should accrue → InterestLog created
      expect(txClient.interestLog.create).toHaveBeenCalledOnce()
    })

    it("charges interest on ALL purchases when lastStatementPaidInFull is false", async () => {
      // Even a purchase made today should accrue when the prior statement was not paid
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)

      const account = makeCCAccount({
        ccDetails: makeCCDetails({
          lastStatementPaidInFull: false,
          statementCloseDay: 15,
        }),
        aprRates: [makeAprRate({ apr: 20 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -100, date: todayDate }),
      ] as never)

      txClient.interestLog.create.mockResolvedValue({})
      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      expect(txClient.interestLog.create).toHaveBeenCalledOnce()
    })
  })

  describe("APR rate resolution", () => {
    it("uses the transaction-linked APR rate when it is active", async () => {
      const linkedRate = makeAprRate({ id: "promo-rate", apr: 0, isActive: true })
      const standardRate = makeAprRate({ id: "std-rate", apr: 24.99, rateType: "STANDARD" })

      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [linkedRate, standardRate],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      // Transaction explicitly links to the 0% promo rate
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -500, aprRateId: "promo-rate", date: new Date("2025-01-01T00:00:00Z") }),
      ] as never)

      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // 0% APR → zero interest → InterestLog should NOT be written
      expect(txClient.interestLog.create).not.toHaveBeenCalled()
    })

    it("falls back to STANDARD rate when linked rate is inactive", async () => {
      const inactivePromo = makeAprRate({ id: "promo-rate", apr: 0, isActive: false })
      const standardRate = makeAprRate({ id: "std-rate", apr: 20, rateType: "STANDARD", isActive: true })

      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [inactivePromo, standardRate],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -100, aprRateId: "promo-rate", date: new Date("2025-01-01T00:00:00Z") }),
      ] as never)

      let loggedAmount: Decimal | undefined
      txClient.interestLog.create.mockImplementation(async ({ data }: { data: { amount: Decimal } }) => {
        loggedAmount = data.amount
        return {}
      })
      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // Should fall back to 20% standard rate
      const expected = new Decimal(100).mul(new Decimal(20).div(100).div(365))
      expect(loggedAmount!.toFixed(8)).toBe(expected.toFixed(8))
    })

    it("skips the transaction entirely when no applicable APR rate exists", async () => {
      // Account has no active STANDARD rate, and transaction has no linked rate
      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [], // no rates at all
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -100, date: new Date("2025-01-01T00:00:00Z") }),
      ] as never)

      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // Zero total interest → nothing written
      expect(txClient.interestLog.create).not.toHaveBeenCalled()
    })
  })

  describe("month-end processing", () => {
    it("posts INTEREST_CHARGED transaction and decrements balance on last day of month", async () => {
      // We cannot easily fake "today" since the job uses `new Date()` internally.
      // Instead we verify the month-end branch by running the job when today IS
      // the last day of the month and inspecting the mock calls.
      //
      // Use a LOCAL-time date string (no Z suffix) so that setHours(0,0,0,0)
      // keeps it on the 31st regardless of the machine's UTC offset.
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2025-01-31T12:00:00"))

      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [makeAprRate({ apr: 20 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -100, date: new Date("2025-01-05T00:00:00Z") }),
      ] as never)

      const monthlyLogAmount = new Decimal("0.054795")
      txClient.interestLog.create.mockResolvedValue({})
      txClient.interestLog.findMany.mockResolvedValue([
        { amount: monthlyLogAmount },
      ])
      txClient.transaction.create.mockResolvedValue({})
      txClient.account.update.mockResolvedValue({})

      await runCCInterestAccrual()

      // InterestLog.create called for the daily entry
      expect(txClient.interestLog.create).toHaveBeenCalledOnce()

      // Month-end: read back monthly logs and post a Transaction
      expect(txClient.interestLog.findMany).toHaveBeenCalledOnce()
      expect(txClient.transaction.create).toHaveBeenCalledOnce()

      const txCreateCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCreateCall.data.type).toBe("INTEREST_CHARGED")
      expect(txCreateCall.data.source).toBe("SYSTEM")

      // Account balance should be decremented
      expect(txClient.account.update).toHaveBeenCalledOnce()
      const updateCall = txClient.account.update.mock.calls[0][0]
      expect(updateCall.data.balance.decrement).toBeDefined()

      vi.useRealTimers()
    })

    it("does NOT post a transaction or update balance on a non-month-end day", async () => {
      vi.useFakeTimers()
      // Jan 15 is not month-end — use local-time noon to avoid timezone edge cases
      vi.setSystemTime(new Date("2025-01-15T12:00:00"))

      const account = makeCCAccount({
        ccDetails: makeCCDetails({ lastStatementPaidInFull: false }),
        aprRates: [makeAprRate({ apr: 20 })],
      })
      mockPrismaAccountFindMany.mockResolvedValue([account] as never)
      mockPrismaTxFindMany.mockResolvedValue([
        makeTx({ amount: -100, date: new Date("2025-01-05T00:00:00Z") }),
      ] as never)

      txClient.interestLog.create.mockResolvedValue({})
      txClient.interestLog.findMany.mockResolvedValue([])

      await runCCInterestAccrual()

      // Daily log is written
      expect(txClient.interestLog.create).toHaveBeenCalledOnce()

      // But no INTEREST_CHARGED transaction and no balance update
      expect(txClient.transaction.create).not.toHaveBeenCalled()
      expect(txClient.account.update).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })
})
