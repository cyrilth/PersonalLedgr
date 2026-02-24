/**
 * Tests for the daily recurring bill auto-generation job.
 *
 * Key behaviours under test:
 *  - Fixed-amount bills create an EXPENSE transaction with source RECURRING
 *    and the exact (negated) amount, then decrement the account balance
 *  - Variable-amount bills create a pending EXPENSE transaction with
 *    notes="PENDING_CONFIRMATION" and do NOT update the account balance
 *  - nextDueDate is advanced to the next future occurrence
 *  - Past-due bills (nextDueDate in the past) generate exactly one transaction
 *    and fast-forward the due date past today
 *  - Exits early when no bills are due today
 *  - All writes per bill are atomic (single Prisma transaction)
 *  - Per-bill errors are caught without aborting other bills
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ../../db ─────────────────────────────────────────────────────────────

vi.mock("../../db", () => {
  const txClient = {
    transaction: {
      create: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
    recurringBill: {
      update: vi.fn(),
    },
  }
  return {
    prisma: {
      recurringBill: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runRecurringBills } from "../recurring-bills"
import Decimal from "decimal.js"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockRecurringBillFindMany = vi.mocked(prisma.recurringBill.findMany)
const txClient = (prisma as unknown as {
  _txClient: {
    transaction: { create: ReturnType<typeof vi.fn> }
    account: { update: ReturnType<typeof vi.fn> }
    recurringBill: { update: ReturnType<typeof vi.fn> }
  }
})._txClient

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Today normalised to midnight local time. */
function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Yesterday midnight — a bill that was due yesterday is past-due. */
function yesterday(): Date {
  const d = todayMidnight()
  d.setDate(d.getDate() - 1)
  return d
}

/** Returns a mock RecurringBill row. */
function makeBill(overrides: {
  id?: string
  name?: string
  amount?: number
  frequency?: "MONTHLY" | "QUARTERLY" | "ANNUAL"
  dayOfMonth?: number
  isVariableAmount?: boolean
  category?: string | null
  nextDueDate?: Date
  userId?: string
  accountId?: string
} = {}) {
  const due = overrides.nextDueDate ?? todayMidnight()
  return {
    id: overrides.id ?? "bill-1",
    name: overrides.name ?? "Netflix",
    amount: new Decimal(overrides.amount ?? 15.99),
    frequency: overrides.frequency ?? "MONTHLY",
    dayOfMonth: overrides.dayOfMonth ?? due.getDate(),
    isVariableAmount: overrides.isVariableAmount ?? false,
    category: overrides.category ?? "Subscriptions",
    nextDueDate: due,
    userId: overrides.userId ?? "user-1",
    accountId: overrides.accountId ?? "acc-checking-1",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  txClient.transaction.create.mockResolvedValue({})
  txClient.account.update.mockResolvedValue({})
  txClient.recurringBill.update.mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runRecurringBills", () => {
  describe("when no bills are due", () => {
    it("exits early without writing any records", async () => {
      mockRecurringBillFindMany.mockResolvedValue([])

      await runRecurringBills()

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe("fixed-amount bills", () => {
    it("creates an EXPENSE transaction with source RECURRING", async () => {
      const bill = makeBill({ amount: 15.99, isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      expect(txClient.transaction.create).toHaveBeenCalledOnce()
      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCall.data.type).toBe("EXPENSE")
      expect(txCall.data.source).toBe("RECURRING")
      expect(txCall.data.accountId).toBe("acc-checking-1")
      expect(txCall.data.userId).toBe("user-1")
    })

    it("stores the amount as a negative value (debit convention)", async () => {
      const bill = makeBill({ amount: 15.99, isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const txCall = txClient.transaction.create.mock.calls[0][0]
      // amount should be "-15.99"
      const storedAmount = parseFloat(txCall.data.amount)
      expect(storedAmount).toBe(-15.99)
    })

    it("decrements the account balance by the bill amount", async () => {
      const bill = makeBill({ amount: 50.00, isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      expect(txClient.account.update).toHaveBeenCalledOnce()
      const updateCall = txClient.account.update.mock.calls[0][0]
      expect(updateCall.where.id).toBe("acc-checking-1")
      // decrement should be positive (the absolute amount)
      expect(parseFloat(updateCall.data.balance.decrement)).toBe(50.00)
    })

    it("does NOT add PENDING_CONFIRMATION notes", async () => {
      const bill = makeBill({ isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCall.data.notes).toBeUndefined()
    })
  })

  describe("variable-amount bills", () => {
    it("creates an EXPENSE transaction with notes=PENDING_CONFIRMATION", async () => {
      const bill = makeBill({ amount: 120.00, isVariableAmount: true })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      expect(txClient.transaction.create).toHaveBeenCalledOnce()
      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCall.data.type).toBe("EXPENSE")
      expect(txCall.data.source).toBe("RECURRING")
      expect(txCall.data.notes).toBe("PENDING_CONFIRMATION")
    })

    it("does NOT update the account balance", async () => {
      const bill = makeBill({ amount: 120.00, isVariableAmount: true })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      expect(txClient.account.update).not.toHaveBeenCalled()
    })

    it("stores the estimated amount as a negative value", async () => {
      const bill = makeBill({ amount: 200, isVariableAmount: true })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(parseFloat(txCall.data.amount)).toBe(-200)
    })
  })

  describe("nextDueDate advancement", () => {
    it("advances nextDueDate to a future date after processing", async () => {
      const bill = makeBill({ frequency: "MONTHLY", isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      expect(txClient.recurringBill.update).toHaveBeenCalledOnce()
      const updateCall = txClient.recurringBill.update.mock.calls[0][0]
      expect(updateCall.where.id).toBe("bill-1")
      // nextDueDate must be strictly in the future
      const nextDue: Date = updateCall.data.nextDueDate
      expect(nextDue > todayMidnight()).toBe(true)
    })

    it("advances a past-due bill's nextDueDate past today (fast-forward)", async () => {
      // Bill was due yesterday — should still only generate one transaction
      // but fast-forward nextDueDate to next occurrence after today
      const bill = makeBill({
        frequency: "MONTHLY",
        isVariableAmount: false,
        nextDueDate: yesterday(),
        dayOfMonth: yesterday().getDate(),
      })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      // Exactly one transaction created
      expect(txClient.transaction.create).toHaveBeenCalledOnce()

      // nextDueDate is strictly after today
      const updateCall = txClient.recurringBill.update.mock.calls[0][0]
      expect(updateCall.data.nextDueDate > todayMidnight()).toBe(true)
    })

    it("advances QUARTERLY bills by approximately 3 months", async () => {
      const today = todayMidnight()
      const bill = makeBill({
        frequency: "QUARTERLY",
        isVariableAmount: false,
        nextDueDate: today,
        dayOfMonth: today.getDate(),
      })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const updateCall = txClient.recurringBill.update.mock.calls[0][0]
      const nextDue: Date = updateCall.data.nextDueDate
      // Should be roughly 3 months ahead (between 85 and 95 days)
      const diffDays = (nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeGreaterThan(85)
      expect(diffDays).toBeLessThan(95)
    })

    it("advances ANNUAL bills by approximately 12 months", async () => {
      const today = todayMidnight()
      const bill = makeBill({
        frequency: "ANNUAL",
        isVariableAmount: false,
        nextDueDate: today,
        dayOfMonth: today.getDate(),
      })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const updateCall = txClient.recurringBill.update.mock.calls[0][0]
      const nextDue: Date = updateCall.data.nextDueDate
      // Should be roughly 12 months ahead (between 360 and 370 days)
      const diffDays = (nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeGreaterThan(360)
      expect(diffDays).toBeLessThan(370)
    })
  })

  describe("atomicity", () => {
    it("wraps all writes for a single bill in one Prisma transaction", async () => {
      const bill = makeBill({ isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      expect(prisma.$transaction).toHaveBeenCalledOnce()
      // All writes inside that single transaction
      expect(txClient.transaction.create).toHaveBeenCalledOnce()
      expect(txClient.account.update).toHaveBeenCalledOnce()
      expect(txClient.recurringBill.update).toHaveBeenCalledOnce()
    })

    it("uses a single Prisma transaction per bill when processing multiple bills", async () => {
      const bills = [
        makeBill({ id: "bill-1", name: "Netflix", isVariableAmount: false }),
        makeBill({ id: "bill-2", name: "Electric Bill", amount: 80, isVariableAmount: true }),
      ]
      mockRecurringBillFindMany.mockResolvedValue(bills as never)

      await runRecurringBills()

      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
      expect(txClient.transaction.create).toHaveBeenCalledTimes(2)
    })
  })

  describe("error isolation", () => {
    it("continues processing remaining bills when one bill fails", async () => {
      const bills = [
        makeBill({ id: "bill-1", name: "Netflix" }),
        makeBill({ id: "bill-2", name: "Rent", amount: 1500 }),
      ]
      mockRecurringBillFindMany.mockResolvedValue(bills as never)

      vi.mocked(prisma.$transaction)
        .mockRejectedValueOnce(new Error("constraint violation"))
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(txClient) as Promise<unknown>)

      await expect(runRecurringBills()).resolves.toBeUndefined()

      // Both attempted; second succeeded
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })
  })

  describe("transaction data correctness", () => {
    it("uses the bill's nextDueDate as the transaction date", async () => {
      const dueDate = todayMidnight()
      const bill = makeBill({ nextDueDate: dueDate, isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const txCall = txClient.transaction.create.mock.calls[0][0]
      // Transaction date should match bill's nextDueDate
      expect(txCall.data.date.getTime()).toBe(dueDate.getTime())
    })

    it("uses the bill name as the transaction description", async () => {
      const bill = makeBill({ name: "Spotify Premium", isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCall.data.description).toBe("Spotify Premium")
    })

    it("passes the bill category to the transaction", async () => {
      const bill = makeBill({ category: "Entertainment", isVariableAmount: false })
      mockRecurringBillFindMany.mockResolvedValue([bill] as never)

      await runRecurringBills()

      const txCall = txClient.transaction.create.mock.calls[0][0]
      expect(txCall.data.category).toBe("Entertainment")
    })
  })
})
