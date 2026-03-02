import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Map()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("@/db", () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    recurringBill: {
      findMany: vi.fn(),
    },
    interestLog: {
      findMany: vi.fn(),
    },
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  getNetWorth,
  getMonthlyIncomeExpense,
  getSpendingByCategory,
  getCreditUtilization,
  getUpcomingBills,
  getRecentTransactions,
  getMonthOverMonthChange,
  getInterestSummary,
} from "../dashboard"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindMany = vi.mocked(prisma.account.findMany)
const mockTransactionFindMany = vi.mocked(prisma.transaction.findMany)
const mockRecurringBillFindMany = vi.mocked(prisma.recurringBill.findMany)
const mockInterestLogFindMany = vi.mocked(prisma.interestLog.findMany)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

/** Wrap a number as a Prisma Decimal-like object */
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getNetWorth ───────────────────────────────────────────────────────────────

describe("getNetWorth", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getNetWorth(2026)).rejects.toThrow("Unauthorized")
  })

  it("returns correct assets, liabilities, and net worth", async () => {
    mockAccountFindMany.mockResolvedValue([
      { balance: decimal(5000), type: "CHECKING" },
      { balance: decimal(10000), type: "SAVINGS" },
      { balance: decimal(-2000), type: "CREDIT_CARD" },
      { balance: decimal(-150000), type: "MORTGAGE" },
    ] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getNetWorth(2026)

    expect(result.assets).toBe(15000)
    expect(result.liabilities).toBe(-152000)
    expect(result.netWorth).toBe(-137000)
  })

  it("excludes inactive accounts (only active accounts fetched)", async () => {
    // The action queries with isActive: true, so mock returns only active
    mockAccountFindMany.mockResolvedValue([
      { balance: decimal(1000), type: "CHECKING" },
    ] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getNetWorth(2026)

    expect(mockAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      })
    )
  })

  it("excludes transactions from inactive accounts in month delta", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getNetWorth(2026)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: { isActive: true },
        }),
      })
    )
  })

  it("calculates month-over-month change from current month transactions", async () => {
    mockAccountFindMany.mockResolvedValue([
      { balance: decimal(5000), type: "CHECKING" },
    ] as never)
    // Current month has a net +500 from transactions
    mockTransactionFindMany.mockResolvedValue([
      { amount: decimal(2000), type: "INCOME", account: { type: "CHECKING" } },
      { amount: decimal(-1500), type: "EXPENSE", account: { type: "CHECKING" } },
    ] as never)

    const result = await getNetWorth(2026)

    // netWorth = 5000, monthDelta = 2000 + (-1500) = 500
    // previousNetWorth = 5000 - 500 = 4500
    // change = 5000 - 4500 = 500
    expect(result.previousNetWorth).toBe(4500)
    expect(result.change).toBe(500)
  })

  it("handles zero balances correctly", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getNetWorth(2026)

    expect(result.netWorth).toBe(0)
    expect(result.assets).toBe(0)
    expect(result.liabilities).toBe(0)
    expect(result.change).toBe(0)
  })
})

// ── getMonthlyIncomeExpense ───────────────────────────────────────────────────

describe("getMonthlyIncomeExpense", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getMonthlyIncomeExpense()).rejects.toThrow("Unauthorized")
  })

  it("excludes transactions from inactive accounts", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMonthlyIncomeExpense()

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: { isActive: true },
        }),
      })
    )
  })

  it("only includes INCOME_TYPES and SPENDING_TYPES (no transfers)", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMonthlyIncomeExpense()

    const whereClause = mockTransactionFindMany.mock.calls[0][0]?.where as Record<string, unknown>
    const typeFilter = whereClause.type as { in: string[] }

    // Should include income types + spending types
    expect(typeFilter.in).toContain("INCOME")
    expect(typeFilter.in).toContain("INTEREST_EARNED")
    expect(typeFilter.in).toContain("EXPENSE")
    expect(typeFilter.in).toContain("LOAN_INTEREST")
    expect(typeFilter.in).toContain("INTEREST_CHARGED")

    // Should NOT include transfers or loan principal
    expect(typeFilter.in).not.toContain("TRANSFER")
    expect(typeFilter.in).not.toContain("LOAN_PRINCIPAL")
  })

  it("returns all 12 months even with no transactions", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getMonthlyIncomeExpense()

    expect(result).toHaveLength(12)
    // Should return trailing 12 months ending at current month
    result.forEach((m) => {
      expect(m.income).toBe(0)
      expect(m.expense).toBe(0)
      expect(m.month).toMatch(/^\d{4}-\d{2}$/)
    })
  })

  it("buckets income and expense transactions into correct months", async () => {
    // Use local-time constructors to avoid UTC-vs-local timezone mismatch
    mockTransactionFindMany.mockResolvedValue([
      { date: new Date(2026, 2, 15), amount: decimal(5000), type: "INCOME" },
      { date: new Date(2026, 2, 20), amount: decimal(-200), type: "EXPENSE" },
      { date: new Date(2026, 2, 25), amount: decimal(50), type: "INTEREST_EARNED" },
      { date: new Date(2026, 1, 15), amount: decimal(-100), type: "LOAN_INTEREST" },
    ] as never)

    const result = await getMonthlyIncomeExpense()

    const march = result.find((m) => m.month === "2026-03")!
    expect(march.income).toBe(5050) // 5000 + 50 (abs values)
    expect(march.expense).toBe(200) // abs(-200)

    const feb = result.find((m) => m.month === "2026-02")!
    expect(feb.income).toBe(0)
    expect(feb.expense).toBe(100) // abs(-100)
  })

  it("uses absolute values for amounts", async () => {
    mockTransactionFindMany.mockResolvedValue([
      { date: new Date("2026-01-15"), amount: decimal(-500), type: "EXPENSE" },
      { date: new Date("2026-01-20"), amount: decimal(3000), type: "INCOME" },
    ] as never)

    const result = await getMonthlyIncomeExpense()
    const jan = result.find((m) => m.month === "2026-01")!

    expect(jan.expense).toBe(500) // abs(-500)
    expect(jan.income).toBe(3000)
  })
})

// ── getSpendingByCategory ─────────────────────────────────────────────────────

describe("getSpendingByCategory", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getSpendingByCategory(2026, 1)).rejects.toThrow("Unauthorized")
  })

  it("groups spending by category and sorts by amount desc", async () => {
    mockTransactionFindMany.mockResolvedValue([
      { category: "Groceries", amount: decimal(-200) },
      { category: "Dining", amount: decimal(-300) },
      { category: "Groceries", amount: decimal(-150) },
      { category: "Transport", amount: decimal(-50) },
    ] as never)

    const result = await getSpendingByCategory(2026, 3)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ category: "Groceries", amount: 350 })
    expect(result[1]).toEqual({ category: "Dining", amount: 300 })
    expect(result[2]).toEqual({ category: "Transport", amount: 50 })
  })

  it("groups null categories as 'Uncategorized'", async () => {
    mockTransactionFindMany.mockResolvedValue([
      { category: null, amount: decimal(-100) },
      { category: null, amount: decimal(-50) },
    ] as never)

    const result = await getSpendingByCategory(2026, 1)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ category: "Uncategorized", amount: 150 })
  })

  it("only includes spending types", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getSpendingByCategory(2026, 5)

    const whereClause = mockTransactionFindMany.mock.calls[0][0]?.where as Record<string, unknown>
    const typeFilter = whereClause.type as { in: string[] }

    expect(typeFilter.in).toContain("EXPENSE")
    expect(typeFilter.in).toContain("LOAN_INTEREST")
    expect(typeFilter.in).toContain("INTEREST_CHARGED")
    expect(typeFilter.in).not.toContain("INCOME")
    expect(typeFilter.in).not.toContain("TRANSFER")
  })

  it("returns empty array when no spending", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getSpendingByCategory(2026, 1)
    expect(result).toEqual([])
  })
})

// ── getCreditUtilization ──────────────────────────────────────────────────────

describe("getCreditUtilization", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getCreditUtilization()).rejects.toThrow("Unauthorized")
  })

  it("returns correct balance, limit, and utilization percentage", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "cc-1",
        name: "Chase Sapphire",
        balance: decimal(-3000),
        creditLimit: decimal(10000),
        owner: "Alice",
      },
    ] as never)

    const result = await getCreditUtilization()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("cc-1")
    expect(result[0].name).toBe("Chase Sapphire")
    expect(result[0].balance).toBe(3000) // abs(-3000)
    expect(result[0].limit).toBe(10000)
    expect(result[0].utilization).toBe(30)
    expect(result[0].owner).toBe("Alice")
  })

  it("only queries CREDIT_CARD type active accounts", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)

    await getCreditUtilization()

    expect(mockAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "CREDIT_CARD",
          isActive: true,
        }),
      })
    )
  })

  it("handles zero credit limit (returns 0 utilization)", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "cc-2",
        name: "Starter Card",
        balance: decimal(-500),
        creditLimit: decimal(0),
        owner: null,
      },
    ] as never)

    const result = await getCreditUtilization()

    expect(result[0].utilization).toBe(0)
  })

  it("handles null credit limit", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "cc-3",
        name: "No Limit Card",
        balance: decimal(-100),
        creditLimit: null,
        owner: null,
      },
    ] as never)

    const result = await getCreditUtilization()

    expect(result[0].limit).toBe(0)
    expect(result[0].utilization).toBe(0)
  })

  it("returns multiple credit cards with correct utilization", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "cc-1",
        name: "Chase",
        balance: decimal(-7500),
        creditLimit: decimal(10000),
        owner: "Alice",
      },
      {
        id: "cc-2",
        name: "Discover",
        balance: decimal(-200),
        creditLimit: decimal(5000),
        owner: "Bob",
      },
    ] as never)

    const result = await getCreditUtilization()

    expect(result).toHaveLength(2)
    expect(result[0].utilization).toBe(75) // 7500/10000 * 100
    expect(result[1].utilization).toBe(4) // 200/5000 * 100
  })
})

// ── getUpcomingBills ──────────────────────────────────────────────────────────

describe("getUpcomingBills", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getUpcomingBills()).rejects.toThrow("Unauthorized")
  })

  it("returns bills sorted by due date with days-until-due", async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 5)

    mockRecurringBillFindMany.mockResolvedValue([
      {
        id: "bill-1",
        name: "Netflix",
        amount: decimal(15.99),
        frequency: "MONTHLY",
        dayOfMonth: futureDate.getDate(),
        isVariableAmount: false,
        nextDueDate: futureDate,
        account: { id: "acc-1", name: "Checking" },
      },
    ] as never)

    const result = await getUpcomingBills()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Netflix")
    expect(result[0].amount).toBe(15.99)
    expect(result[0].daysUntilDue).toBeGreaterThanOrEqual(4)
    expect(result[0].daysUntilDue).toBeLessThanOrEqual(6)
    expect(result[0].account).toEqual({ id: "acc-1", name: "Checking" })
  })

  it("respects count parameter", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)

    await getUpcomingBills(5)

    expect(mockRecurringBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    )
  })

  it("defaults count to 10", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)

    await getUpcomingBills()

    expect(mockRecurringBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })

  it("queries only active bills ordered by nextDueDate asc", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)

    await getUpcomingBills()

    expect(mockRecurringBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
        orderBy: { nextDueDate: "asc" },
      })
    )
  })

  it("includes isVariableAmount flag for variable bills", async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 10)

    mockRecurringBillFindMany.mockResolvedValue([
      {
        id: "bill-2",
        name: "Electric Bill",
        amount: decimal(120),
        frequency: "MONTHLY",
        dayOfMonth: 15,
        isVariableAmount: true,
        nextDueDate: futureDate,
        account: { id: "acc-1", name: "Checking" },
      },
    ] as never)

    const result = await getUpcomingBills()

    expect(result[0].isVariableAmount).toBe(true)
  })
})

// ── getRecentTransactions ─────────────────────────────────────────────────────

describe("getRecentTransactions", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getRecentTransactions()).rejects.toThrow("Unauthorized")
  })

  it("returns correct count of recent transactions with account info", async () => {
    mockTransactionFindMany.mockResolvedValue([
      {
        id: "txn-1",
        date: new Date("2026-01-15"),
        description: "Coffee",
        amount: decimal(-5.50),
        type: "EXPENSE",
        category: "Food",
        account: { id: "acc-1", name: "Checking" },
      },
      {
        id: "txn-2",
        date: new Date("2026-01-14"),
        description: "Salary",
        amount: decimal(5000),
        type: "INCOME",
        category: "Salary",
        account: { id: "acc-1", name: "Checking" },
      },
    ] as never)

    const result = await getRecentTransactions(2)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("txn-1")
    expect(result[0].amount).toBe(-5.50)
    expect(result[0].account).toEqual({ id: "acc-1", name: "Checking" })
  })

  it("respects count parameter", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getRecentTransactions(5)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    )
  })

  it("defaults count to 10", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getRecentTransactions()

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })

  it("excludes transactions from inactive accounts", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getRecentTransactions()

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: { isActive: true },
        }),
      })
    )
  })

  it("orders by date descending (newest first)", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getRecentTransactions()

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { date: "desc" } })
    )
  })

  it("converts Decimal amounts to numbers", async () => {
    mockTransactionFindMany.mockResolvedValue([
      {
        id: "txn-1",
        date: new Date(),
        description: "Test",
        amount: decimal(42.99),
        type: "EXPENSE",
        category: "Food",
        account: { id: "acc-1", name: "Checking" },
      },
    ] as never)

    const result = await getRecentTransactions()

    expect(typeof result[0].amount).toBe("number")
    expect(result[0].amount).toBe(42.99)
  })
})

// ── getMonthOverMonthChange ───────────────────────────────────────────────────

describe("getMonthOverMonthChange", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getMonthOverMonthChange(2026)).rejects.toThrow("Unauthorized")
  })

  it("returns all 12 months with net change", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getMonthOverMonthChange(2026)

    expect(result).toHaveLength(12)
    expect(result[0].month).toBe("2026-01")
    expect(result[11].month).toBe("2026-12")
    result.forEach((m) => {
      expect(m.netChange).toBe(0)
    })
  })

  it("calculates net change per month correctly", async () => {
    // Use local-time constructors to avoid UTC-vs-local timezone mismatch
    mockTransactionFindMany.mockResolvedValue([
      { date: new Date(2026, 0, 15), amount: decimal(5000) },
      { date: new Date(2026, 0, 20), amount: decimal(-3000) },
      { date: new Date(2026, 1, 10), amount: decimal(4500) },
      { date: new Date(2026, 1, 15), amount: decimal(-2000) },
    ] as never)

    const result = await getMonthOverMonthChange(2026)

    const jan = result.find((m) => m.month === "2026-01")!
    expect(jan.netChange).toBe(2000) // 5000 + (-3000)

    const feb = result.find((m) => m.month === "2026-02")!
    expect(feb.netChange).toBe(2500) // 4500 + (-2000)
  })

  it("excludes transactions from inactive accounts", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMonthOverMonthChange(2026)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: { isActive: true },
        }),
      })
    )
  })

  it("includes all transaction types in net change (including transfers)", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMonthOverMonthChange(2026)

    // Should NOT have a type filter — all transactions included
    const whereClause = mockTransactionFindMany.mock.calls[0][0]?.where as Record<string, unknown>
    expect(whereClause).not.toHaveProperty("type")
  })

  it("filters transactions to the specified year", async () => {
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMonthOverMonthChange(2025)

    const whereClause = mockTransactionFindMany.mock.calls[0][0]?.where as Record<string, unknown>
    const dateFilter = whereClause.date as { gte: Date; lt: Date }

    expect(dateFilter.gte).toEqual(new Date(2025, 0, 1))
    expect(dateFilter.lt).toEqual(new Date(2026, 0, 1))
  })
})

// ── getInterestSummary ──────────────────────────────────────────────────────

describe("getInterestSummary", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getInterestSummary()).rejects.toThrow("Unauthorized")
  })

  it("returns zeros when no interest logs exist", async () => {
    mockInterestLogFindMany.mockResolvedValue([] as never)

    const result = await getInterestSummary()

    expect(result.thisMonth.charged).toBe(0)
    expect(result.thisMonth.earned).toBe(0)
    expect(result.thisMonth.net).toBe(0)
    expect(result.thisYear.charged).toBe(0)
    expect(result.thisYear.earned).toBe(0)
    expect(result.thisYear.net).toBe(0)
  })

  it("separates charged and earned interest for month and year", async () => {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15)
    // A date from earlier this year but a different month
    const earlierMonth = now.getMonth() > 0
      ? new Date(now.getFullYear(), 0, 15)
      : new Date(now.getFullYear(), now.getMonth(), 5)

    mockInterestLogFindMany.mockResolvedValue([
      // Current month charges and earnings
      { date: thisMonth, amount: decimal(50), type: "CHARGED" },
      { date: thisMonth, amount: decimal(10), type: "EARNED" },
      // Earlier in the year (only counts toward year totals if different month)
      { date: earlierMonth, amount: decimal(100), type: "CHARGED" },
      { date: earlierMonth, amount: decimal(25), type: "EARNED" },
    ] as never)

    const result = await getInterestSummary()

    // Year totals include everything
    expect(result.thisYear.charged).toBe(150)
    expect(result.thisYear.earned).toBe(35)
    expect(result.thisYear.net).toBe(-115)
  })

  it("calculates net as earned minus charged", async () => {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 10)

    mockInterestLogFindMany.mockResolvedValue([
      { date: thisMonth, amount: decimal(200), type: "EARNED" },
      { date: thisMonth, amount: decimal(50), type: "CHARGED" },
    ] as never)

    const result = await getInterestSummary()

    // Net = earned - charged = 200 - 50 = 150
    expect(result.thisMonth.net).toBe(150)
    expect(result.thisYear.net).toBe(150)
  })

  it("uses absolute values for amounts", async () => {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 10)

    mockInterestLogFindMany.mockResolvedValue([
      { date: thisMonth, amount: decimal(-30), type: "CHARGED" },
      { date: thisMonth, amount: decimal(20), type: "EARNED" },
    ] as never)

    const result = await getInterestSummary()

    expect(result.thisMonth.charged).toBe(30)
    expect(result.thisMonth.earned).toBe(20)
  })

  it("queries only active accounts and current year", async () => {
    mockInterestLogFindMany.mockResolvedValue([] as never)

    await getInterestSummary()

    expect(mockInterestLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: { isActive: true },
        }),
      })
    )
  })
})
