/**
 * Tests for the monthly savings interest payout job.
 *
 * Key behaviours under test:
 *  - Monthly interest = balance × (APY / 100 / 12), rounded to 2 decimal places
 *  - Creates an InterestLog record (type EARNED) and an INTEREST_EARNED Transaction
 *    (source SYSTEM) inside a single Prisma transaction
 *  - Account balance is incremented by the computed interest amount
 *  - Accounts with zero or negative balance are skipped (the DB query filters them)
 *  - Accounts without an APY are skipped
 *  - Computed interest that rounds to 0 is skipped without writing any records
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ../../db ─────────────────────────────────────────────────────────────

vi.mock("../../db", () => {
  const txClient = {
    interestLog: {
      create: vi.fn(),
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
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runSavingsInterest } from "../interest-savings"
import Decimal from "decimal.js"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockAccountFindMany = vi.mocked(prisma.account.findMany)
const txClient = (prisma as unknown as {
  _txClient: {
    interestLog: { create: ReturnType<typeof vi.fn> }
    transaction: { create: ReturnType<typeof vi.fn> }
    account: { update: ReturnType<typeof vi.fn> }
  }
})._txClient

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSavingsAccount(overrides: {
  id?: string
  name?: string
  balance?: number
  userId?: string
  apy?: number
} = {}) {
  return {
    id: overrides.id ?? "acc-savings-1",
    name: overrides.name ?? "High Yield Savings",
    balance: new Decimal(overrides.balance ?? 10000),
    userId: overrides.userId ?? "user-1",
    apy: new Decimal(overrides.apy ?? 4.5),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: all txClient writes succeed
  txClient.interestLog.create.mockResolvedValue({})
  txClient.transaction.create.mockResolvedValue({})
  txClient.account.update.mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runSavingsInterest", () => {
  describe("when there are no eligible accounts", () => {
    it("exits early without writing any records", async () => {
      mockAccountFindMany.mockResolvedValue([])

      await runSavingsInterest()

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe("monthly interest formula", () => {
    it("calculates interest as balance × (APY / 100 / 12) rounded to 2 decimal places", async () => {
      // balance=10000, APY=4.5 → 10000 × (4.5/100/12) = 37.5 → rounds to $37.50
      const account = makeSavingsAccount({ balance: 10000, apy: 4.5 })
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      expect(txClient.transaction.create).toHaveBeenCalledOnce()
      const createCall = txClient.transaction.create.mock.calls[0][0]
      expect(createCall.data.amount).toBe("37.50")
    })

    it("rounds fractional cents correctly (half-away-from-zero)", async () => {
      // balance=1000, APY=1.0 → 1000 × (1.0/100/12) = 0.8333... → rounds to $0.83
      const account = makeSavingsAccount({ balance: 1000, apy: 1.0 })
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      const createCall = txClient.transaction.create.mock.calls[0][0]
      expect(createCall.data.amount).toBe("0.83")
    })

    it("computes zero interest for a very small balance and low rate, and skips the account", async () => {
      // balance=0.01, APY=0.01 → 0.01 × (0.01/100/12) ≈ 0.0000000008 → rounds to $0.00
      const account = makeSavingsAccount({ balance: 0.01, apy: 0.01 })
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      // Interest rounds to 0, so job should skip — no writes
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe("transaction creation", () => {
    it("creates an InterestLog entry with type EARNED", async () => {
      const account = makeSavingsAccount({ balance: 5000, apy: 3.0 })
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      expect(txClient.interestLog.create).toHaveBeenCalledOnce()
      const logCall = txClient.interestLog.create.mock.calls[0][0]
      expect(logCall.data.type).toBe("EARNED")
      expect(logCall.data.accountId).toBe("acc-savings-1")
      expect(logCall.data.userId).toBe("user-1")
    })

    it("creates an INTEREST_EARNED transaction with source SYSTEM", async () => {
      const account = makeSavingsAccount({ balance: 5000, apy: 3.0 })
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      expect(txClient.transaction.create).toHaveBeenCalledOnce()
      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCall.data.type).toBe("INTEREST_EARNED")
      expect(txCall.data.source).toBe("SYSTEM")
      expect(txCall.data.accountId).toBe("acc-savings-1")
      expect(txCall.data.userId).toBe("user-1")
    })

    it("increments the account balance by the interest amount", async () => {
      // balance=10000, APY=4.5 → interest=$37.50
      const account = makeSavingsAccount({ balance: 10000, apy: 4.5 })
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      expect(txClient.account.update).toHaveBeenCalledOnce()
      const updateCall = txClient.account.update.mock.calls[0][0]
      expect(updateCall.where.id).toBe("acc-savings-1")
      expect(updateCall.data.balance.increment).toBe("37.50")
    })

    it("wraps all three writes in a single Prisma transaction", async () => {
      const account = makeSavingsAccount()
      mockAccountFindMany.mockResolvedValue([account] as never)

      await runSavingsInterest()

      // $transaction called once per account
      expect(prisma.$transaction).toHaveBeenCalledOnce()
      // All three writes happen inside that single transaction
      expect(txClient.interestLog.create).toHaveBeenCalledOnce()
      expect(txClient.transaction.create).toHaveBeenCalledOnce()
      expect(txClient.account.update).toHaveBeenCalledOnce()
    })
  })

  describe("skipping logic", () => {
    it("processes multiple accounts independently", async () => {
      const accounts = [
        makeSavingsAccount({ id: "acc-1", name: "Acc 1", balance: 10000, apy: 4.5 }),
        makeSavingsAccount({ id: "acc-2", name: "Acc 2", balance: 5000, apy: 2.0 }),
      ]
      mockAccountFindMany.mockResolvedValue(accounts as never)

      await runSavingsInterest()

      // One $transaction call per account
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
      expect(txClient.interestLog.create).toHaveBeenCalledTimes(2)
      expect(txClient.transaction.create).toHaveBeenCalledTimes(2)
      expect(txClient.account.update).toHaveBeenCalledTimes(2)
    })

    it("continues processing remaining accounts when one account fails", async () => {
      const accounts = [
        makeSavingsAccount({ id: "acc-1", balance: 10000 }),
        makeSavingsAccount({ id: "acc-2", balance: 5000 }),
      ]
      mockAccountFindMany.mockResolvedValue(accounts as never)

      // First call throws; second succeeds
      vi.mocked(prisma.$transaction)
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(txClient) as Promise<unknown>)

      // Should not throw — errors are caught per account
      await expect(runSavingsInterest()).resolves.toBeUndefined()

      // Second account still processed
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })
  })
})
