import { describe, it, expect } from "vitest"
import {
  toNumber,
  computeBalanceHistory,
  groupAccountsByType,
  computeDrift,
  computeNetWorth,
  computeUtilization,
  calculatePaymentSplit,
  generateAmortizationSchedule,
  calculateExtraPaymentImpact,
  calculateTotalInterestRemaining,
} from "@/lib/calculations"

// ── toNumber ────────────────────────────────────────────────────────

describe("toNumber", () => {
  it("converts a number", () => {
    expect(toNumber(42)).toBe(42)
  })

  it("converts a string number", () => {
    expect(toNumber("123.45")).toBe(123.45)
  })

  it("converts null to 0", () => {
    expect(toNumber(null)).toBe(0)
  })

  it("converts undefined to NaN", () => {
    expect(toNumber(undefined)).toBeNaN()
  })
})

// ── computeBalanceHistory ───────────────────────────────────────────

describe("computeBalanceHistory", () => {
  it("walks back correctly from current balance", () => {
    // currentBalance=1000, Feb had +300, Jan had +200
    // Feb end balance = 1000 (current)
    // Jan end balance = 1000 - 300 = 700
    const result = computeBalanceHistory(
      1000,
      { "2026-01": 200, "2026-02": 300 },
      ["2026-01", "2026-02"]
    )

    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ date: "2026-02", balance: 1000 })
    expect(result[0]).toEqual({ date: "2026-01", balance: 700 })
  })

  it("returns flat line when no transactions", () => {
    const result = computeBalanceHistory(
      500,
      {},
      ["2026-01", "2026-02", "2026-03"]
    )

    expect(result).toHaveLength(3)
    expect(result.every((r) => r.balance === 500)).toBe(true)
  })

  it("handles single month", () => {
    const result = computeBalanceHistory(1000, { "2026-01": 100 }, ["2026-01"])
    expect(result).toEqual([{ date: "2026-01", balance: 1000 }])
  })

  it("rounds to 2 decimal places", () => {
    const result = computeBalanceHistory(
      100.1 + 0.2, // floating point imprecision
      { "2026-02": 50 },
      ["2026-01", "2026-02"]
    )

    // Each balance should be rounded to cents
    for (const entry of result) {
      const decimals = entry.balance.toString().split(".")[1]
      expect(!decimals || decimals.length <= 2).toBe(true)
    }
  })

  it("returns empty array for empty monthKeys", () => {
    const result = computeBalanceHistory(1000, {}, [])
    expect(result).toEqual([])
  })
})

// ── groupAccountsByType ─────────────────────────────────────────────

const mockAccount = (overrides: Partial<{
  id: string; name: string; type: string; balance: number;
  creditLimit: number | null; owner: string | null; isActive: boolean
}>) => ({
  id: "1",
  name: "Test",
  type: "CHECKING",
  balance: 0,
  creditLimit: null,
  owner: null,
  isActive: true,
  ...overrides,
})

const labels: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit Card",
}

describe("groupAccountsByType", () => {
  it("groups accounts by type with correct totals", () => {
    const accounts = [
      mockAccount({ id: "1", type: "CHECKING", balance: 500 }),
      mockAccount({ id: "2", type: "CHECKING", balance: 300 }),
      mockAccount({ id: "3", type: "SAVINGS", balance: 1000 }),
    ]

    const result = groupAccountsByType(accounts, ["CHECKING", "SAVINGS"], labels)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe("CHECKING")
    expect(result[0].total).toBe(800)
    expect(result[0].accounts).toHaveLength(2)
    expect(result[1].type).toBe("SAVINGS")
    expect(result[1].total).toBe(1000)
  })

  it("returns empty array for empty input", () => {
    const result = groupAccountsByType([], ["CHECKING", "SAVINGS"], labels)
    expect(result).toEqual([])
  })

  it("excludes types with no accounts", () => {
    const accounts = [mockAccount({ type: "CHECKING", balance: 100 })]
    const result = groupAccountsByType(accounts, ["CHECKING", "SAVINGS", "CREDIT_CARD"], labels)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("CHECKING")
  })

  it("preserves typeOrder ordering", () => {
    const accounts = [
      mockAccount({ id: "1", type: "SAVINGS", balance: 100 }),
      mockAccount({ id: "2", type: "CHECKING", balance: 200 }),
    ]
    const result = groupAccountsByType(accounts, ["CHECKING", "SAVINGS"], labels)
    expect(result[0].type).toBe("CHECKING")
    expect(result[1].type).toBe("SAVINGS")
  })

  it("assigns correct labels", () => {
    const accounts = [mockAccount({ type: "CREDIT_CARD", balance: -500 })]
    const result = groupAccountsByType(accounts, ["CREDIT_CARD"], labels)
    expect(result[0].label).toBe("Credit Card")
  })
})

// ── computeDrift ────────────────────────────────────────────────────

describe("computeDrift", () => {
  it("returns zero when balances match", () => {
    expect(computeDrift(100, 100)).toBe(0)
  })

  it("returns positive drift when calculated > stored", () => {
    expect(computeDrift(100, 105)).toBe(5)
  })

  it("returns negative drift when calculated < stored", () => {
    expect(computeDrift(100, 95)).toBe(-5)
  })

  it("rounds to 2 decimal places", () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(computeDrift(0, 0.1 + 0.2)).toBe(0.3)
  })

  it("handles large differences", () => {
    expect(computeDrift(0, 1000000)).toBe(1000000)
  })
})

// ── computeNetWorth ─────────────────────────────────────────────────

describe("computeNetWorth", () => {
  it("splits assets and liabilities correctly", () => {
    const accounts = [
      { balance: 5000, type: "CHECKING" },
      { balance: 3000, type: "SAVINGS" },
      { balance: -2000, type: "CREDIT_CARD" },
      { balance: -100000, type: "MORTGAGE" },
    ]

    const result = computeNetWorth(accounts)

    expect(result.assets).toBe(8000)
    expect(result.liabilities).toBe(-102000)
    expect(result.netWorth).toBe(-94000)
  })

  it("handles all assets (no liabilities)", () => {
    const accounts = [
      { balance: 1000, type: "CHECKING" },
      { balance: 2000, type: "SAVINGS" },
    ]

    const result = computeNetWorth(accounts)

    expect(result.assets).toBe(3000)
    expect(result.liabilities).toBe(0)
    expect(result.netWorth).toBe(3000)
  })

  it("handles all liabilities (no assets)", () => {
    const accounts = [
      { balance: -500, type: "CREDIT_CARD" },
      { balance: -10000, type: "LOAN" },
    ]

    const result = computeNetWorth(accounts)

    expect(result.assets).toBe(0)
    expect(result.liabilities).toBe(-10500)
    expect(result.netWorth).toBe(-10500)
  })

  it("handles empty array", () => {
    const result = computeNetWorth([])

    expect(result.assets).toBe(0)
    expect(result.liabilities).toBe(0)
    expect(result.netWorth).toBe(0)
  })
})

// ── computeUtilization ──────────────────────────────────────────────

describe("computeUtilization", () => {
  it("computes normal utilization", () => {
    expect(computeUtilization(500, 1000)).toBe(50)
  })

  it("returns 0 for zero limit", () => {
    expect(computeUtilization(500, 0)).toBe(0)
  })

  it("returns 0 for negative limit", () => {
    expect(computeUtilization(500, -100)).toBe(0)
  })

  it("handles over-limit (>100%)", () => {
    expect(computeUtilization(1500, 1000)).toBe(150)
  })

  it("rounds to 2 decimal places", () => {
    // 333 / 1000 * 100 = 33.3
    expect(computeUtilization(333, 1000)).toBe(33.3)
  })

  it("returns 0 for zero balance and positive limit", () => {
    expect(computeUtilization(0, 1000)).toBe(0)
  })
})

// ── calculatePaymentSplit ───────────────────────────────────────────

describe("calculatePaymentSplit", () => {
  it("splits a standard mortgage payment into principal and interest", () => {
    // $200,000 at 6% APR → monthly interest = 200000 * 0.06/12 = $1,000
    const result = calculatePaymentSplit(200000, 6, 1199.1)
    expect(result.interest).toBe(1000)
    expect(result.principal).toBe(199.1)
  })

  it("handles negative balance (loans stored as negative)", () => {
    const result = calculatePaymentSplit(-200000, 6, 1199.1)
    expect(result.interest).toBe(1000)
    expect(result.principal).toBe(199.1)
  })

  it("caps principal at 0 when payment is less than interest", () => {
    // Interest would be $1,000 but payment is only $500
    const result = calculatePaymentSplit(200000, 6, 500)
    expect(result.interest).toBe(500)
    expect(result.principal).toBe(0)
  })

  it("handles zero balance", () => {
    const result = calculatePaymentSplit(0, 6, 500)
    expect(result.interest).toBe(0)
    expect(result.principal).toBe(500)
  })

  it("handles zero APR (interest-free loan)", () => {
    const result = calculatePaymentSplit(10000, 0, 500)
    expect(result.interest).toBe(0)
    expect(result.principal).toBe(500)
  })

  it("rounds to 2 decimal places", () => {
    // $100,000 at 7.25% → monthly interest = 100000 * 0.0725/12 = 604.166...
    const result = calculatePaymentSplit(100000, 7.25, 700)
    expect(result.interest).toBe(604.17)
    expect(result.principal).toBe(95.83)
  })
})

// ── generateAmortizationSchedule ────────────────────────────────────

describe("generateAmortizationSchedule", () => {
  it("generates correct number of months for a short loan", () => {
    // $1,000 at 0% with $500/month = 2 months
    const schedule = generateAmortizationSchedule(1000, 0, 500, 12)
    expect(schedule).toHaveLength(2)
    expect(schedule[0].remainingBalance).toBe(500)
    expect(schedule[1].remainingBalance).toBe(0)
  })

  it("caps at remainingMonths even if loan is not paid off", () => {
    const schedule = generateAmortizationSchedule(100000, 6, 100, 3)
    expect(schedule).toHaveLength(3)
    expect(schedule[2].remainingBalance).toBeGreaterThan(0)
  })

  it("adjusts final payment to not overpay", () => {
    // $1,200 at 0% with $500/month: month 1=$500, month 2=$500, month 3=$200
    const schedule = generateAmortizationSchedule(1200, 0, 500, 12)
    expect(schedule).toHaveLength(3)
    expect(schedule[2].payment).toBe(200)
    expect(schedule[2].remainingBalance).toBe(0)
  })

  it("handles negative balance (abs value used)", () => {
    const schedule = generateAmortizationSchedule(-1000, 0, 500, 12)
    expect(schedule).toHaveLength(2)
  })

  it("returns empty array for zero balance", () => {
    const schedule = generateAmortizationSchedule(0, 6, 500, 12)
    expect(schedule).toEqual([])
  })

  it("tracks interest accumulation on a realistic loan", () => {
    // $100,000 at 6% with $599.55/month (30-year mortgage payment)
    const schedule = generateAmortizationSchedule(100000, 6, 599.55, 360)
    // First month interest should be $500
    expect(schedule[0].interest).toBe(500)
    expect(schedule[0].principal).toBe(99.55)
    // Balance should decrease over time
    expect(schedule[schedule.length - 1].remainingBalance).toBeLessThanOrEqual(1)
  })

  it("month numbers start at 1 and increment", () => {
    const schedule = generateAmortizationSchedule(1000, 0, 500, 12)
    expect(schedule[0].month).toBe(1)
    expect(schedule[1].month).toBe(2)
  })
})

// ── calculateExtraPaymentImpact ─────────────────────────────────────

describe("calculateExtraPaymentImpact", () => {
  it("shows fewer months and less interest with extra payments", () => {
    const result = calculateExtraPaymentImpact(100000, 6, 599.55, 200)
    // Extra $200/month should significantly reduce payoff time
    expect(result.newPayoffMonths).toBeLessThan(360)
    expect(result.interestSaved).toBeGreaterThan(0)
    expect(result.newTotalInterest).toBeGreaterThan(0)
  })

  it("returns same as baseline when extra is 0", () => {
    const result = calculateExtraPaymentImpact(100000, 6, 599.55, 0)
    // With 0 extra, newPayoffMonths should be the same as baseline
    const baseSchedule = generateAmortizationSchedule(100000, 6, 599.55, 600)
    expect(result.newPayoffMonths).toBe(baseSchedule.length)
    expect(result.interestSaved).toBe(0)
  })

  it("handles paying off immediately with large extra", () => {
    // Extra payment larger than the balance
    const result = calculateExtraPaymentImpact(1000, 6, 500, 10000)
    expect(result.newPayoffMonths).toBe(1)
  })

  it("rounds interestSaved and newTotalInterest to cents", () => {
    const result = calculateExtraPaymentImpact(100000, 7.25, 682.18, 100)
    const savedDecimals = result.interestSaved.toString().split(".")[1]
    const totalDecimals = result.newTotalInterest.toString().split(".")[1]
    expect(!savedDecimals || savedDecimals.length <= 2).toBe(true)
    expect(!totalDecimals || totalDecimals.length <= 2).toBe(true)
  })
})

// ── calculateTotalInterestRemaining ─────────────────────────────────

describe("calculateTotalInterestRemaining", () => {
  it("calculates total remaining interest for a standard loan", () => {
    // $100,000 at 6% with ~$599.55/month over 360 months
    const result = calculateTotalInterestRemaining(100000, 6, 599.55)
    // Total interest on a 30-yr 6% $100k loan is ~$115,838
    expect(result).toBeGreaterThan(100000)
    expect(result).toBeLessThan(130000)
  })

  it("returns 0 for zero balance", () => {
    expect(calculateTotalInterestRemaining(0, 6, 500)).toBe(0)
  })

  it("returns 0 for zero APR", () => {
    expect(calculateTotalInterestRemaining(10000, 0, 500)).toBe(0)
  })

  it("handles negative balance", () => {
    const pos = calculateTotalInterestRemaining(100000, 6, 599.55)
    const neg = calculateTotalInterestRemaining(-100000, 6, 599.55)
    expect(pos).toBe(neg)
  })

  it("is rounded to cents", () => {
    const result = calculateTotalInterestRemaining(100000, 7.25, 682.18)
    const decimals = result.toString().split(".")[1]
    expect(!decimals || decimals.length <= 2).toBe(true)
  })
})
