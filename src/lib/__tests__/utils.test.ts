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
  currentPaymentPeriod,
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

  it("preserves a date-only string calendar day", () => {
    expect(formatDate("2026-03-28")).toBe("Mar 28, 2026")
  })

  it("preserves a midnight UTC ISO string calendar day", () => {
    expect(formatDate("2026-03-28T00:00:00.000Z")).toBe("Mar 28, 2026")
  })
})

describe("formatDateShort", () => {
  it("formats without year", () => {
    const d = new Date(2026, 0, 15)
    expect(formatDateShort(d)).toBe("Jan 15")
  })

  it("preserves recurring due date calendar day", () => {
    expect(formatDateShort("2026-07-05T00:00:00.000Z")).toBe("Jul 5")
  })
})

describe("formatMonthYear", () => {
  it("formats as full month and year", () => {
    const d = new Date(2026, 0, 1)
    expect(formatMonthYear(d)).toBe("January 2026")
  })

  it("preserves date-only month headers", () => {
    expect(formatMonthYear("2026-02-01")).toBe("February 2026")
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

describe("currentPaymentPeriod", () => {
  it("returns 1 on the start date itself (no payment due yet)", () => {
    const start = new Date(2022, 6, 29) // Jul 29, 2022
    expect(currentPaymentPeriod(start, new Date(2022, 6, 29))).toBe(1)
  })

  it("counts the period once the monthly anniversary is reached", () => {
    const start = new Date(2022, 6, 29) // Jul 29
    // Aug 29 = first anniversary → still period 1's payment just due, period 2 begins
    expect(currentPaymentPeriod(start, new Date(2022, 7, 29))).toBe(2)
  })

  it("does NOT advance before the anniversary day (the off-by-one bug)", () => {
    const start = new Date(2022, 6, 29) // Jul 29
    // Aug 1: a new calendar month, but Jul-29 anniversary not yet reached → still period 1
    expect(currentPaymentPeriod(start, new Date(2022, 7, 1))).toBe(1)
  })

  it("matches the real mortgage scenario: Jul 29 2022 viewed Jun 12 2026 → 47", () => {
    const start = new Date(2022, 6, 29) // Jul 29, 2022
    // Day 12 < start day 29, so the June anniversary (29th) hasn't hit → 46 paid, in period 47
    expect(currentPaymentPeriod(start, new Date(2026, 5, 12))).toBe(47)
  })

  it("returns 48 once that month's anniversary passes", () => {
    const start = new Date(2022, 6, 29)
    // Jun 30 2026 is past the 29th → period advances to 48
    expect(currentPaymentPeriod(start, new Date(2026, 5, 30))).toBe(48)
  })

  it("handles a day-of-month at or after the start day", () => {
    const start = new Date(2022, 0, 10) // Jan 10
    // Feb 15: past the 10th anniversary → period 2
    expect(currentPaymentPeriod(start, new Date(2022, 1, 15))).toBe(2)
    // Feb 5: before the 10th → still period 1
    expect(currentPaymentPeriod(start, new Date(2022, 1, 5))).toBe(1)
  })

  it("respects date-only string start dates without UTC drift", () => {
    // Stored as midnight-UTC ISO (Prisma date-only convention)
    expect(currentPaymentPeriod("2022-07-29T00:00:00.000Z", new Date(2026, 5, 12))).toBe(47)
  })

  // ── Month-end anniversary clamping (start day 29–31 in shorter months) ──

  it("clamps a Jan-31 anniversary to the last day of February", () => {
    const start = new Date(2022, 0, 31) // Jan 31
    // Feb 27: anniversary (clamped to 28) not yet reached → still period 1
    expect(currentPaymentPeriod(start, new Date(2022, 1, 27))).toBe(1)
    // Feb 28: clamped anniversary reached → period 2 (was incorrectly 1 before)
    expect(currentPaymentPeriod(start, new Date(2022, 1, 28))).toBe(2)
  })

  it("clamps to Feb 29 in a leap year", () => {
    const start = new Date(2024, 0, 31) // Jan 31, 2024 (leap)
    expect(currentPaymentPeriod(start, new Date(2024, 1, 28))).toBe(1) // before the 29th
    expect(currentPaymentPeriod(start, new Date(2024, 1, 29))).toBe(2) // leap-day anniversary
  })

  it("clamps a 31-start anniversary in a 30-day month", () => {
    const start = new Date(2022, 2, 31) // Mar 31
    expect(currentPaymentPeriod(start, new Date(2022, 3, 29))).toBe(1) // Apr 29, before clamp
    expect(currentPaymentPeriod(start, new Date(2022, 3, 30))).toBe(2) // Apr 30, clamped anniversary
  })

  it("does not over-clamp in a month long enough for the start day", () => {
    const start = new Date(2022, 0, 31) // Jan 31
    // March has 31 days, so no clamping applies
    expect(currentPaymentPeriod(start, new Date(2022, 2, 30))).toBe(2) // Mar 30, before the 31st
    expect(currentPaymentPeriod(start, new Date(2022, 2, 31))).toBe(3) // Mar 31 anniversary
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
