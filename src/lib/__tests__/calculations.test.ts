import { describe, it, expect } from "vitest"
import {
  toNumber,
  computeBalanceHistory,
  groupAccountsByType,
  computeDrift,
  computeNetWorth,
  computeUtilization,
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
