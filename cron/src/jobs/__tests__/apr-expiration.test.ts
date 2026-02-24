/**
 * Tests for the APR rate expiration cleanup job.
 *
 * Key behaviours under test:
 *  - Expired rates have their isActive flag set to false
 *  - Transactions referencing an expired rate are reassigned to the account's
 *    active STANDARD rate when one exists
 *  - When no active STANDARD rate exists, aprRateId is cleared (set to null)
 *  - Rates with no linked transactions are deactivated with no transaction update
 *  - Exits early when no expired rates are found
 *  - All mutations per rate are wrapped in a single Prisma transaction
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ../../db ─────────────────────────────────────────────────────────────

vi.mock("../../db", () => {
  const txClient = {
    aprRate: {
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    transaction: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  }
  return {
    prisma: {
      aprRate: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runAprExpiration } from "../apr-expiration"
import Decimal from "decimal.js"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockAprRateFindMany = vi.mocked(prisma.aprRate.findMany)
const txClient = (prisma as unknown as {
  _txClient: {
    aprRate: {
      update: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
    }
    transaction: {
      count: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
    }
  }
})._txClient

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a past date guaranteed to be "expired" (yesterday or earlier). */
function pastDate(daysAgo = 1): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function makeExpiredRate(overrides: {
  id?: string
  accountId?: string
  rateType?: string
  apr?: number
  expirationDate?: Date
} = {}) {
  return {
    id: overrides.id ?? "rate-expired-1",
    accountId: overrides.accountId ?? "acc-1",
    rateType: overrides.rateType ?? "PROMOTIONAL",
    apr: new Decimal(overrides.apr ?? 0),
    expirationDate: overrides.expirationDate ?? pastDate(1),
  }
}

function makeStandardRate(overrides: { id?: string; apr?: number } = {}) {
  return {
    id: overrides.id ?? "rate-standard-1",
    apr: new Decimal(overrides.apr ?? 24.99),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  txClient.aprRate.update.mockResolvedValue({})
  txClient.transaction.updateMany.mockResolvedValue({ count: 0 })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAprExpiration", () => {
  describe("when there are no expired rates", () => {
    it("exits early without writing anything", async () => {
      mockAprRateFindMany.mockResolvedValue([])

      await runAprExpiration()

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe("rate deactivation", () => {
    it("sets isActive=false on each expired rate", async () => {
      mockAprRateFindMany.mockResolvedValue([makeExpiredRate()] as never)
      txClient.transaction.count.mockResolvedValue(0)

      await runAprExpiration()

      expect(txClient.aprRate.update).toHaveBeenCalledOnce()
      const updateCall = txClient.aprRate.update.mock.calls[0][0]
      expect(updateCall.where.id).toBe("rate-expired-1")
      expect(updateCall.data.isActive).toBe(false)
    })

    it("deactivates multiple expired rates in separate transactions", async () => {
      const rates = [
        makeExpiredRate({ id: "rate-1", accountId: "acc-1" }),
        makeExpiredRate({ id: "rate-2", accountId: "acc-2" }),
      ]
      mockAprRateFindMany.mockResolvedValue(rates as never)
      txClient.transaction.count.mockResolvedValue(0)

      await runAprExpiration()

      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
      expect(txClient.aprRate.update).toHaveBeenCalledTimes(2)
    })
  })

  describe("transaction reassignment — STANDARD rate exists", () => {
    it("reassigns affected transactions to the active STANDARD rate", async () => {
      mockAprRateFindMany.mockResolvedValue([makeExpiredRate()] as never)
      txClient.transaction.count.mockResolvedValue(3) // 3 transactions linked to expired rate
      txClient.aprRate.findFirst.mockResolvedValue(makeStandardRate({ id: "std-1" }))
      txClient.transaction.updateMany.mockResolvedValue({ count: 3 })

      await runAprExpiration()

      expect(txClient.transaction.updateMany).toHaveBeenCalledOnce()
      const updateManyCall = txClient.transaction.updateMany.mock.calls[0][0]
      expect(updateManyCall.where.aprRateId).toBe("rate-expired-1")
      expect(updateManyCall.data.aprRateId).toBe("std-1")
    })

    it("looks up the STANDARD rate scoped to the same account", async () => {
      const expiredRate = makeExpiredRate({ id: "rate-1", accountId: "acc-42" })
      mockAprRateFindMany.mockResolvedValue([expiredRate] as never)
      txClient.transaction.count.mockResolvedValue(1)
      txClient.aprRate.findFirst.mockResolvedValue(makeStandardRate())
      txClient.transaction.updateMany.mockResolvedValue({ count: 1 })

      await runAprExpiration()

      expect(txClient.aprRate.findFirst).toHaveBeenCalledOnce()
      const findCall = txClient.aprRate.findFirst.mock.calls[0][0]
      expect(findCall.where.accountId).toBe("acc-42")
      expect(findCall.where.rateType).toBe("STANDARD")
      expect(findCall.where.isActive).toBe(true)
    })
  })

  describe("transaction reassignment — no STANDARD rate", () => {
    it("clears aprRateId to null when no active STANDARD rate exists", async () => {
      mockAprRateFindMany.mockResolvedValue([makeExpiredRate()] as never)
      txClient.transaction.count.mockResolvedValue(2)
      txClient.aprRate.findFirst.mockResolvedValue(null) // no standard rate
      txClient.transaction.updateMany.mockResolvedValue({ count: 2 })

      await runAprExpiration()

      expect(txClient.transaction.updateMany).toHaveBeenCalledOnce()
      const updateManyCall = txClient.transaction.updateMany.mock.calls[0][0]
      expect(updateManyCall.where.aprRateId).toBe("rate-expired-1")
      expect(updateManyCall.data.aprRateId).toBeNull()
    })
  })

  describe("when expired rate has no linked transactions", () => {
    it("deactivates the rate but does not call updateMany", async () => {
      mockAprRateFindMany.mockResolvedValue([makeExpiredRate()] as never)
      txClient.transaction.count.mockResolvedValue(0) // no affected transactions

      await runAprExpiration()

      expect(txClient.aprRate.update).toHaveBeenCalledOnce()
      // No need to look up standard rate or updateMany
      expect(txClient.aprRate.findFirst).not.toHaveBeenCalled()
      expect(txClient.transaction.updateMany).not.toHaveBeenCalled()
    })
  })

  describe("atomicity", () => {
    it("wraps all mutations for a single rate in one Prisma transaction", async () => {
      mockAprRateFindMany.mockResolvedValue([makeExpiredRate()] as never)
      txClient.transaction.count.mockResolvedValue(1)
      txClient.aprRate.findFirst.mockResolvedValue(makeStandardRate())
      txClient.transaction.updateMany.mockResolvedValue({ count: 1 })

      await runAprExpiration()

      // Exactly one $transaction call for one expired rate
      expect(prisma.$transaction).toHaveBeenCalledOnce()
      // All mutations happen inside that single call
      expect(txClient.aprRate.update).toHaveBeenCalledOnce()
      expect(txClient.transaction.count).toHaveBeenCalledOnce()
      expect(txClient.transaction.updateMany).toHaveBeenCalledOnce()
    })
  })

  describe("mixed scenarios", () => {
    it("handles one rate with transactions (reassigned) and one without", async () => {
      const rateWithTx = makeExpiredRate({ id: "rate-1", accountId: "acc-1" })
      const rateWithoutTx = makeExpiredRate({ id: "rate-2", accountId: "acc-2" })
      mockAprRateFindMany.mockResolvedValue([rateWithTx, rateWithoutTx] as never)

      // First rate has 2 transactions; second has none
      txClient.transaction.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0)

      txClient.aprRate.findFirst.mockResolvedValue(makeStandardRate())
      txClient.transaction.updateMany.mockResolvedValue({ count: 2 })

      await runAprExpiration()

      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
      // updateMany called only for the rate that had transactions
      expect(txClient.transaction.updateMany).toHaveBeenCalledTimes(1)
    })
  })
})
