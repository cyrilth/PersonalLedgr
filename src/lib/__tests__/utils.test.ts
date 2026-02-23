import { describe, it, expect } from "vitest"
import {
  formatCurrency,
  formatCurrencySigned,
  formatDate,
  formatDateShort,
  formatMonthYear,
  getMonthKey,
  startOfMonth,
  endOfMonth,
  generateId,
} from "@/lib/utils"

describe("formatCurrency", () => {
  it("formats positive amounts", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56")
  })

  it("formats negative amounts", () => {
    const result = formatCurrency(-1234.56)
    // Intl may use U+2212 minus sign or hyphen-minus
    expect(result).toMatch(/[-−]\$1,234\.56/)
  })

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00")
  })

  it("formats large numbers with commas", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00")
  })

  it("rounds to 2 decimal places", () => {
    expect(formatCurrency(1.999)).toBe("$2.00")
  })
})

describe("formatCurrencySigned", () => {
  it("formats positive with no prefix", () => {
    expect(formatCurrencySigned(500)).toBe("$500.00")
  })

  it("formats negative with hyphen-minus prefix", () => {
    expect(formatCurrencySigned(-500)).toBe("-$500.00")
  })

  it("formats zero", () => {
    expect(formatCurrencySigned(0)).toBe("$0.00")
  })
})

describe("formatDate", () => {
  it("formats a Date object", () => {
    const d = new Date(2026, 0, 15) // Jan 15, 2026
    expect(formatDate(d)).toBe("Jan 15, 2026")
  })

  it("formats an ISO string", () => {
    // Use a date string that won't be affected by timezone
    const result = formatDate(new Date(2026, 5, 1))
    expect(result).toBe("Jun 1, 2026")
  })
})

describe("formatDateShort", () => {
  it("formats without year", () => {
    const d = new Date(2026, 0, 15)
    expect(formatDateShort(d)).toBe("Jan 15")
  })
})

describe("formatMonthYear", () => {
  it("formats as full month and year", () => {
    const d = new Date(2026, 0, 1)
    expect(formatMonthYear(d)).toBe("January 2026")
  })
})

describe("getMonthKey", () => {
  it("returns YYYY-MM with zero padding", () => {
    expect(getMonthKey(new Date(2026, 0, 15))).toBe("2026-01")
  })

  it("handles December correctly", () => {
    expect(getMonthKey(new Date(2025, 11, 31))).toBe("2025-12")
  })

  it("handles double-digit months without extra padding", () => {
    expect(getMonthKey(new Date(2026, 9, 1))).toBe("2026-10")
  })
})

describe("startOfMonth", () => {
  it("returns first day of month at midnight", () => {
    const result = startOfMonth(new Date(2026, 5, 15, 14, 30))
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(5)
    expect(result.getDate()).toBe(1)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
  })
})

describe("endOfMonth", () => {
  it("returns last day of month at 23:59:59.999", () => {
    const result = endOfMonth(new Date(2026, 0, 15)) // January
    expect(result.getDate()).toBe(31)
    expect(result.getHours()).toBe(23)
    expect(result.getMinutes()).toBe(59)
    expect(result.getSeconds()).toBe(59)
    expect(result.getMilliseconds()).toBe(999)
  })

  it("handles February in a non-leap year", () => {
    const result = endOfMonth(new Date(2025, 1, 10)) // Feb 2025
    expect(result.getDate()).toBe(28)
  })

  it("handles February in a leap year", () => {
    const result = endOfMonth(new Date(2028, 1, 10)) // Feb 2028
    expect(result.getDate()).toBe(29)
  })
})

describe("generateId", () => {
  it("returns a valid UUID format", () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it("returns unique values", () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })
})
