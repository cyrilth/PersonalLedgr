import { describe, it, expect } from "vitest"
import { formatMonthLabel, formatDollar } from "../balance-chart"

describe("formatMonthLabel", () => {
  it("converts 2026-01 to Jan", () => {
    expect(formatMonthLabel("2026-01")).toBe("Jan")
  })

  it("converts 2026-12 to Dec", () => {
    expect(formatMonthLabel("2026-12")).toBe("Dec")
  })

  it("converts 2026-06 to Jun", () => {
    expect(formatMonthLabel("2026-06")).toBe("Jun")
  })
})

describe("formatDollar", () => {
  it("formats integer values", () => {
    expect(formatDollar(1000)).toBe("$1,000")
  })

  it("formats large numbers with thousands separator", () => {
    expect(formatDollar(1234567)).toBe("$1,234,567")
  })

  it("formats zero", () => {
    expect(formatDollar(0)).toBe("$0")
  })

  it("truncates decimals", () => {
    expect(formatDollar(1234.56)).toBe("$1,235")
  })
})
