/**
 * Tests for the credit card statement close job.
 *
 * Key behaviours under test:
 *  - Creates (updates) a statement record with a correct balance snapshot
 *  - Sets paidInFull=true when total payments >= prior statement balance
 *  - Sets paidInFull=false when total payments < prior statement balance
 *  - Treats a prior statement balance of zero as "paid in full"
 *  - Exits early when no accounts have a statement closing today
 *  - All writes are atomic (wrapped in a Prisma transaction)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ../../db ─────────────────────────────────────────────────────────────

vi.mock("../../db", () => {
  const txClient = {
    creditCardDetails: {
      update: vi.fn(),
    },
  }
  return {
    prisma: {
      creditCardDetails: {
        findMany: vi.fn(),
      },
      transaction: {
        aggregate: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runStatementClose } from "../statement-close"
import Decimal from "decimal.js"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockCCDetailsFindMany = vi.mocked(prisma.creditCardDetails.findMany)
const mockTxAggregate = vi.mocked(prisma.transaction.aggregate)
const txClient = (prisma as unknown as {
  _txClient: {
    creditCardDetails: { update: ReturnType<typeof vi.fn> }
  }
})._txClient

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the UTC day-of-month so tests anchor to the real current day. */
function todayUtcDay(): number {
  return new Date().getUTCDate()
}

function makeCCDetails(overrides: {
  accountId?: string
  statementCloseDay?: number
  lastStatementBalance?: number
  accountBalance?: number
  accountName?: string
} = {}) {
  return {
    accountId: overrides.accountId ?? "acc-cc-1",
    statementCloseDay: overrides.statementCloseDay ?? todayUtcDay(),
    lastStatementBalance: new Decimal(overrides.lastStatementBalance ?? -500),
    lastStatementPaidInFull: false,
    creditLimit: new Decimal(5000),
    minimumPayment: new Decimal(25),
    paymentDueDay: 25,
    gracePeriodDays: 21,
    createdAt: new Date(),
    updatedAt: new Date(),
    account: {
      id: overrides.accountId ?? "acc-cc-1",
      name: overrides.accountName ?? "Test Visa",
      balance: new Decimal(overrides.accountBalance ?? -350),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  txClient.creditCardDetails.update.mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runStatementClose", () => {
  describe("when no accounts have a statement closing today", () => {
    it("exits early without reading transactions or writing anything", async () => {
      mockCCDetailsFindMany.mockResolvedValue([])

      await runStatementClose()

      expect(mockTxAggregate).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe("balance snapshot", () => {
    it("saves the current account balance as the new lastStatementBalance", async () => {
      const details = makeCCDetails({ accountBalance: -350, lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(500) } } as never)

      await runStatementClose()

      expect(txClient.creditCardDetails.update).toHaveBeenCalledOnce()
      const updateCall = txClient.creditCardDetails.update.mock.calls[0][0]
      // newStatementBalance = Number(account.balance) = -350
      expect(updateCall.data.lastStatementBalance).toBe(-350)
      expect(updateCall.where.accountId).toBe("acc-cc-1")
    })
  })

  describe("paidInFull determination", () => {
    it("sets paidInFull=true when payments equal the prior statement owed amount", async () => {
      // Prior statement: -500 → owed = 500. Payments: 500 → exactly paid.
      const details = makeCCDetails({ lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(500) } } as never)

      await runStatementClose()

      const updateCall = txClient.creditCardDetails.update.mock.calls[0][0]
      expect(updateCall.data.lastStatementPaidInFull).toBe(true)
    })

    it("sets paidInFull=true when payments exceed the prior statement owed amount", async () => {
      // Prior statement: -500 → owed = 500. Payments: 600 → overpaid → paidInFull.
      const details = makeCCDetails({ lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(600) } } as never)

      await runStatementClose()

      const updateCall = txClient.creditCardDetails.update.mock.calls[0][0]
      expect(updateCall.data.lastStatementPaidInFull).toBe(true)
    })

    it("sets paidInFull=false when payments are less than the prior statement owed amount", async () => {
      // Prior statement: -500 → owed = 500. Payments: 200 → partial payment → NOT paid in full.
      const details = makeCCDetails({ lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(200) } } as never)

      await runStatementClose()

      const updateCall = txClient.creditCardDetails.update.mock.calls[0][0]
      expect(updateCall.data.lastStatementPaidInFull).toBe(false)
    })

    it("sets paidInFull=false when there are zero payments and prior balance was non-zero", async () => {
      const details = makeCCDetails({ lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      // No payments returned by aggregate
      mockTxAggregate.mockResolvedValue({ _sum: { amount: null } } as never)

      await runStatementClose()

      const updateCall = txClient.creditCardDetails.update.mock.calls[0][0]
      expect(updateCall.data.lastStatementPaidInFull).toBe(false)
    })

    it("sets paidInFull=true when the prior statement balance was zero (nothing owed)", async () => {
      // prevStatementOwed = |0| = 0 → special case: treated as paid in full
      const details = makeCCDetails({ lastStatementBalance: 0 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: null } } as never)

      await runStatementClose()

      const updateCall = txClient.creditCardDetails.update.mock.calls[0][0]
      expect(updateCall.data.lastStatementPaidInFull).toBe(true)
    })
  })

  describe("atomicity", () => {
    it("wraps the update in a Prisma transaction", async () => {
      const details = makeCCDetails({ lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(500) } } as never)

      await runStatementClose()

      expect(prisma.$transaction).toHaveBeenCalledOnce()
      // The update happens on the txClient, not on the outer prisma object
      expect(txClient.creditCardDetails.update).toHaveBeenCalledOnce()
    })
  })

  describe("error isolation", () => {
    it("processes remaining accounts when one account update fails", async () => {
      const details1 = makeCCDetails({ accountId: "acc-1", statementCloseDay: todayUtcDay() })
      const details2 = makeCCDetails({ accountId: "acc-2", statementCloseDay: todayUtcDay(), accountName: "Card 2" })
      mockCCDetailsFindMany.mockResolvedValue([details1, details2] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(300) } } as never)

      // First account's $transaction fails; second succeeds
      vi.mocked(prisma.$transaction)
        .mockRejectedValueOnce(new Error("Deadlock"))
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(txClient) as Promise<unknown>)

      await expect(runStatementClose()).resolves.toBeUndefined()

      // Second account should still process
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })
  })

  describe("payment detection query", () => {
    it("queries only INCOME, TRANSFER, and INTEREST_EARNED transactions with positive amounts", async () => {
      const details = makeCCDetails({ lastStatementBalance: -500 })
      mockCCDetailsFindMany.mockResolvedValue([details] as never)
      mockTxAggregate.mockResolvedValue({ _sum: { amount: new Decimal(500) } } as never)

      await runStatementClose()

      expect(mockTxAggregate).toHaveBeenCalledOnce()
      const aggCall = mockTxAggregate.mock.calls[0][0]
      expect(aggCall.where.amount.gt).toBe(0)
      expect(aggCall.where.type.in).toEqual(
        expect.arrayContaining(["INCOME", "TRANSFER", "INTEREST_EARNED"])
      )
      // Exactly those three types — no more
      expect(aggCall.where.type.in).toHaveLength(3)
    })
  })
})
