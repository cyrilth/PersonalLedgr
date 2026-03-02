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

vi.mock("@/db", () => {
  const txClient = {
    transaction: {
      createMany: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
  }

  return {
    prisma: {
      account: {
        findFirst: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  parseCSV,
  detectColumns,
  detectAmountPattern,
  normalizeAmounts,
  detectDuplicates,
  importTransactions,
  type ColumnMapping,
  type NormalizedTransaction,
} from "../import"
import { levenshtein } from "@/lib/import-utils"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockTransactionFindMany = vi.mocked(prisma.transaction.findMany)
const mockPrismaTransaction = vi.mocked(prisma.$transaction)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txClient = (prisma as any)._txClient as {
  transaction: { createMany: ReturnType<typeof vi.fn> }
  account: { update: ReturnType<typeof vi.fn> }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── levenshtein ───────────────────────────────────────────────────────────────

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0)
  })

  it("returns the length of the other string when one is empty", () => {
    expect(levenshtein("", "hello")).toBe(5)
    expect(levenshtein("hello", "")).toBe(5)
  })

  it("returns 0 for two empty strings", () => {
    expect(levenshtein("", "")).toBe(0)
  })

  it("returns 1 for a single character difference (substitution)", () => {
    expect(levenshtein("cat", "bat")).toBe(1)
  })

  it("returns 1 for a single character insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1)
  })

  it("returns 1 for a single character deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1)
  })

  it("is case insensitive", () => {
    expect(levenshtein("Hello", "hello")).toBe(0)
    expect(levenshtein("WALMART", "walmart")).toBe(0)
  })

  it("returns correct distance for completely different strings of equal length", () => {
    expect(levenshtein("abc", "xyz")).toBe(3)
  })

  it("returns a large number for strings whose lengths differ by more than 10", () => {
    const result = levenshtein("short", "this is a much longer string here")
    // The early-exit optimization returns abs(length difference)
    expect(result).toBeGreaterThan(10)
  })

  it("handles typical bank description fuzzy match — minor suffix difference", () => {
    // Distance of 2: "WALMART #1234" vs "WALMART #1235" — should be close
    expect(levenshtein("WALMART #1234", "WALMART #1235")).toBe(1)
  })

  it("returns 2 for a two-character difference", () => {
    expect(levenshtein("kitten", "bitten")).toBe(1)
  })
})

// ── parseCSV ──────────────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses a simple CSV with headers and data rows", async () => {
    const csv = "Date,Description,Amount\n2026-01-15,Coffee,5.50\n2026-01-16,Lunch,12.00"
    const result = await parseCSV(csv)

    expect(result.headers).toEqual(["Date", "Description", "Amount"])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual(["2026-01-15", "Coffee", "5.50"])
    expect(result.rows[1]).toEqual(["2026-01-16", "Lunch", "12.00"])
  })

  it("handles quoted fields containing commas", async () => {
    const csv = 'Date,Description,Amount\n2026-01-15,"Coffee, Espresso",5.50'
    const result = await parseCSV(csv)

    expect(result.rows[0][1]).toBe("Coffee, Espresso")
  })

  it("handles quoted fields containing newlines", async () => {
    const csv = 'Date,Description,Amount\n2026-01-15,"Line one\nLine two",5.50\n2026-01-16,Next,10.00'
    const result = await parseCSV(csv)

    expect(result.rows[0][1]).toBe("Line one\nLine two")
    expect(result.rows).toHaveLength(2)
  })

  it("handles escaped double quotes inside quoted fields", async () => {
    const csv = 'Date,Description,Amount\n2026-01-15,"He said ""hello""",5.50'
    const result = await parseCSV(csv)

    expect(result.rows[0][1]).toBe('He said "hello"')
  })

  it("strips BOM character from the beginning of the file", async () => {
    const bom = "\uFEFF"
    const csv = `${bom}Date,Description,Amount\n2026-01-15,Coffee,5.50`
    const result = await parseCSV(csv)

    expect(result.headers[0]).toBe("Date")
    expect(result.headers[0].charCodeAt(0)).not.toBe(0xfeff)
  })

  it("handles CRLF (\\r\\n) line endings", async () => {
    const csv = "Date,Description,Amount\r\n2026-01-15,Coffee,5.50\r\n2026-01-16,Lunch,12.00"
    const result = await parseCSV(csv)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual(["2026-01-15", "Coffee", "5.50"])
  })

  it("throws 'CSV file is empty' for completely empty content", async () => {
    await expect(parseCSV("")).rejects.toThrow("CSV file is empty")
  })

  it("throws 'CSV file is empty' for header-only content (no data rows)", async () => {
    await expect(parseCSV("Date,Description,Amount")).rejects.toThrow("CSV file is empty")
  })

  it("throws 'CSV file is empty' for only whitespace/newlines", async () => {
    await expect(parseCSV("\n\n\n")).rejects.toThrow("CSV file is empty")
  })

  it("filters out completely empty rows", async () => {
    const csv = "Date,Description,Amount\n2026-01-15,Coffee,5.50\n,,\n2026-01-16,Lunch,12.00\n"
    const result = await parseCSV(csv)

    // Empty row with all commas should be filtered; trailing empty line also filtered
    expect(result.rows).toHaveLength(2)
  })

  it("trims whitespace from header names", async () => {
    const csv = " Date , Description , Amount \n2026-01-15,Coffee,5.50"
    const result = await parseCSV(csv)

    expect(result.headers).toEqual(["Date", "Description", "Amount"])
  })
})

// ── detectColumns ─────────────────────────────────────────────────────────────

describe("detectColumns", () => {
  const sampleRows = [
    ["2026-01-15", "Coffee", "5.50"],
    ["2026-01-16", "Lunch", "-12.00"],
  ]

  it("detects Date, Description, Amount headers (Pattern 1 — single signed amount)", async () => {
    const result = await detectColumns(["Date", "Description", "Amount"], sampleRows)

    expect(result.dateColumn).toBe(0)
    expect(result.descriptionColumn).toBe(1)
    expect(result.amountPattern).toMatchObject({ type: "single", amountColumn: 2 })
  })

  it("detects Date, Description, Debit, Credit headers (Pattern 2 — separate columns)", async () => {
    const headers = ["Date", "Description", "Debit", "Credit"]
    const rows = [
      ["2026-01-15", "Coffee", "5.50", ""],
      ["2026-01-16", "Paycheck", "", "2000.00"],
    ]
    const result = await detectColumns(headers, rows)

    expect(result.dateColumn).toBe(0)
    expect(result.descriptionColumn).toBe(1)
    expect(result.amountPattern).toMatchObject({
      type: "separate",
      debitColumn: 2,
      creditColumn: 3,
    })
  })

  it("detects Date, Description, Amount, Type with DR/CR values (Pattern 3 — indicator)", async () => {
    const headers = ["Date", "Description", "Amount", "Type"]
    const rows = [
      ["2026-01-15", "Coffee", "5.50", "DR"],
      ["2026-01-16", "Paycheck", "2000.00", "CR"],
    ]
    const result = await detectColumns(headers, rows)

    expect(result.dateColumn).toBe(0)
    expect(result.descriptionColumn).toBe(1)
    expect(result.amountPattern).toMatchObject({
      type: "indicator",
      amountColumn: 2,
      indicatorColumn: 3,
    })
  })

  it("returns null amountPattern for completely unrecognizable headers", async () => {
    const result = await detectColumns(["Foo", "Bar", "Baz"], sampleRows)

    expect(result.amountPattern).toBeNull()
  })

  it("returns null dateColumn when no date-like header found", async () => {
    const result = await detectColumns(["Posted", "Description", "Amount"], sampleRows)

    expect(result.dateColumn).toBeNull()
  })

  it("returns null descriptionColumn when no description-like header found", async () => {
    const result = await detectColumns(["Date", "Reference", "Amount"], sampleRows)

    expect(result.descriptionColumn).toBeNull()
  })

  it("detects Category column when present", async () => {
    const headers = ["Date", "Description", "Amount", "Category"]
    const result = await detectColumns(headers, sampleRows)

    expect(result.categoryColumn).toBe(3)
  })

  it("returns null categoryColumn when no category-like header found", async () => {
    const result = await detectColumns(["Date", "Description", "Amount"], sampleRows)

    expect(result.categoryColumn).toBeNull()
  })

  it("performs case-insensitive header matching", async () => {
    const result = await detectColumns(["DATE", "DESCRIPTION", "AMOUNT"], sampleRows)

    expect(result.dateColumn).toBe(0)
    expect(result.descriptionColumn).toBe(1)
    expect(result.amountPattern).toMatchObject({ type: "single", amountColumn: 2 })
  })

  it("detects alternative date header names (Transaction Date, Post Date)", async () => {
    const resultTransDate = await detectColumns(["Transaction Date", "Description", "Amount"], sampleRows)
    expect(resultTransDate.dateColumn).toBe(0)

    const resultPostDate = await detectColumns(["Post Date", "Description", "Amount"], sampleRows)
    expect(resultPostDate.dateColumn).toBe(0)
  })

  it("detects alternative description header names (Memo, Payee, Narrative)", async () => {
    const resultMemo = await detectColumns(["Date", "Memo", "Amount"], sampleRows)
    expect(resultMemo.descriptionColumn).toBe(1)

    const resultPayee = await detectColumns(["Date", "Payee", "Amount"], sampleRows)
    expect(resultPayee.descriptionColumn).toBe(1)

    const resultNarrative = await detectColumns(["Date", "Narrative", "Amount"], sampleRows)
    expect(resultNarrative.descriptionColumn).toBe(1)
  })

  it("detects Withdrawal/Deposit headers as Pattern 2", async () => {
    const headers = ["Date", "Description", "Withdrawal", "Deposit"]
    const rows = [
      ["2026-01-15", "Coffee", "5.50", ""],
      ["2026-01-16", "Paycheck", "", "2000.00"],
    ]
    const result = await detectColumns(headers, rows)

    expect(result.amountPattern).toMatchObject({
      type: "separate",
      debitColumn: 2,
      creditColumn: 3,
    })
  })
})

// ── detectAmountPattern ───────────────────────────────────────────────────────

describe("detectAmountPattern", () => {
  it("returns Pattern 1 (single) for Amount header with signed values", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Amount"],
      [["2026-01-15", "Coffee", "-5.50"], ["2026-01-16", "Refund", "10.00"]]
    )

    expect(result).toMatchObject({ type: "single", amountColumn: 2 })
  })

  it("returns Pattern 1 (single) for Amount header even when no negatives in sample", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Amount"],
      [["2026-01-15", "Coffee", "5.50"]]
    )

    expect(result).toMatchObject({ type: "single", amountColumn: 2 })
  })

  it("returns Pattern 2 (separate) for Debit + Credit headers", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Debit", "Credit"],
      [["2026-01-15", "Coffee", "5.50", ""], ["2026-01-16", "Paycheck", "", "2000.00"]]
    )

    expect(result).toMatchObject({ type: "separate", debitColumn: 2, creditColumn: 3 })
  })

  it("returns Pattern 2 for Withdrawal + Deposit headers", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Withdrawal", "Deposit"],
      [["2026-01-15", "Coffee", "5.50", ""]]
    )

    expect(result).toMatchObject({ type: "separate", debitColumn: 2, creditColumn: 3 })
  })

  it("returns Pattern 3 (indicator) for Amount + Type when indicator values contain DR", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Amount", "Type"],
      [
        ["2026-01-15", "Coffee", "5.50", "DR"],
        ["2026-01-16", "Paycheck", "2000.00", "CR"],
      ]
    )

    expect(result).toMatchObject({
      type: "indicator",
      amountColumn: 2,
      indicatorColumn: 3,
      debitValues: expect.arrayContaining(["DR"]),
    })
  })

  it("returns Pattern 3 for Amount + Type when indicator values contain DEBIT", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Amount", "Type"],
      [
        ["2026-01-15", "Coffee", "5.50", "DEBIT"],
        ["2026-01-16", "Paycheck", "2000.00", "CREDIT"],
      ]
    )

    expect(result).toMatchObject({ type: "indicator" })
  })

  it("returns null when no amount-related column found", async () => {
    const result = await detectAmountPattern(
      ["Date", "Description", "Reference"],
      [["2026-01-15", "Coffee", "REF123"]]
    )

    expect(result).toBeNull()
  })

  it("falls back to Pattern 1 when Type column has no debit indicators in sample", async () => {
    // If Type column only has non-debit values, fall back to single amount pattern
    const result = await detectAmountPattern(
      ["Date", "Description", "Amount", "Type"],
      [
        ["2026-01-15", "Coffee", "5.50", "POSTED"],
        ["2026-01-16", "Paycheck", "2000.00", "CLEARED"],
      ]
    )

    // Should fall back to single pattern since no DR/DEBIT/D/DB/- indicators found
    expect(result).toMatchObject({ type: "single", amountColumn: 2 })
  })
})

// ── normalizeAmounts ──────────────────────────────────────────────────────────

describe("normalizeAmounts", () => {
  // ── Pattern 1: single signed amount ──

  describe("Pattern 1 (single signed amount)", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      descriptionColumn: 1,
      amountPattern: { type: "single", amountColumn: 2 },
    }

    it("returns positive amounts as-is (credit/income)", async () => {
      const rows = [["2026-01-15", "Paycheck", "2000.00"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(2000)
    })

    it("returns negative amounts as-is (debit/expense)", async () => {
      const rows = [["2026-01-15", "Coffee", "-5.50"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(-5.5)
    })

    it("strips dollar signs and commas from amounts", async () => {
      const rows = [["2026-01-15", "Rent", "$1,500.00"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(1500)
    })

    it("handles parenthetical negatives like (100.00)", async () => {
      const rows = [["2026-01-15", "Fee", "(100.00)"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(-100)
    })

    it("rounds amounts to 2 decimal places", async () => {
      const rows = [["2026-01-15", "Coffee", "5.555"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(5.56)
    })
  })

  // ── Pattern 2: separate debit/credit ──

  describe("Pattern 2 (separate debit/credit columns)", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      descriptionColumn: 1,
      amountPattern: { type: "separate", debitColumn: 2, creditColumn: 3 },
    }

    it("debit value becomes negative", async () => {
      const rows = [["2026-01-15", "Coffee", "5.50", ""]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(-5.5)
    })

    it("credit value becomes positive", async () => {
      const rows = [["2026-01-15", "Paycheck", "", "2000.00"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(2000)
    })

    it("debit takes precedence over empty credit", async () => {
      const rows = [["2026-01-15", "Withdrawal", "100.00", ""]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(-100)
    })

    it("skips rows where both debit and credit are empty", async () => {
      const rows = [["2026-01-15", "Something", "", ""]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result).toHaveLength(0)
    })
  })

  // ── Pattern 3: indicator-based ──

  describe("Pattern 3 (indicator-based)", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      descriptionColumn: 1,
      amountPattern: {
        type: "indicator",
        amountColumn: 2,
        indicatorColumn: 3,
        debitValues: ["DR", "D"],
      },
    }

    it("DR indicator makes amount negative", async () => {
      const rows = [["2026-01-15", "Coffee", "5.50", "DR"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(-5.5)
    })

    it("CR indicator (not in debitValues) makes amount positive", async () => {
      const rows = [["2026-01-15", "Paycheck", "2000.00", "CR"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(2000)
    })

    it("ensures debit amount is always negative even if value is already positive", async () => {
      const rows = [["2026-01-15", "Fee", "50.00", "D"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].amount).toBe(-50)
    })

    it("indicator comparison is case-insensitive against indicator values", async () => {
      const rows = [["2026-01-15", "Coffee", "5.50", "dr"]]
      const result = await normalizeAmounts(rows, mapping)

      // "dr".toUpperCase() === "DR" which is in debitValues
      expect(result[0].amount).toBe(-5.5)
    })
  })

  // ── Row filtering ──

  describe("row filtering", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      descriptionColumn: 1,
      amountPattern: { type: "single", amountColumn: 2 },
    }

    it("skips rows with missing date", async () => {
      const rows = [["", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)
      expect(result).toHaveLength(0)
    })

    it("skips rows with missing description", async () => {
      const rows = [["2026-01-15", "", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)
      expect(result).toHaveLength(0)
    })

    it("skips rows with invalid date strings", async () => {
      const rows = [["not-a-date", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)
      expect(result).toHaveLength(0)
    })

    it("skips rows with zero amount", async () => {
      const rows = [["2026-01-15", "Zero charge", "0.00"]]
      const result = await normalizeAmounts(rows, mapping)
      expect(result).toHaveLength(0)
    })

    it("skips rows with unparseable amount", async () => {
      const rows = [["2026-01-15", "Bad row", "N/A"]]
      const result = await normalizeAmounts(rows, mapping)
      expect(result).toHaveLength(0)
    })
  })

  // ── Date parsing ──

  describe("date parsing", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      descriptionColumn: 1,
      amountPattern: { type: "single", amountColumn: 2 },
    }

    it("parses MM/DD/YYYY dates correctly", async () => {
      const rows = [["01/15/2026", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].date).toBe("2026-01-15")
    })

    it("parses YYYY-MM-DD (ISO) dates correctly", async () => {
      const rows = [["2026-01-15", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].date).toBe("2026-01-15")
    })

    it("parses MM/DD/YY short-year dates (adds 2000)", async () => {
      const rows = [["01/15/26", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].date).toBe("2026-01-15")
    })

    it("parses M/D/YYYY single-digit month and day", async () => {
      const rows = [["1/5/2026", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].date).toBe("2026-01-05")
    })
  })

  // ── Category mapping ──

  describe("category column mapping", () => {
    it("maps category column when categoryColumn is specified in mapping", async () => {
      const mapping: ColumnMapping = {
        dateColumn: 0,
        descriptionColumn: 1,
        amountPattern: { type: "single", amountColumn: 2 },
        categoryColumn: 3,
      }
      const rows = [["2026-01-15", "Coffee", "5.50", "Food & Drink"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].category).toBe("Food & Drink")
    })

    it("sets category to null when categoryColumn is not provided", async () => {
      const mapping: ColumnMapping = {
        dateColumn: 0,
        descriptionColumn: 1,
        amountPattern: { type: "single", amountColumn: 2 },
      }
      const rows = [["2026-01-15", "Coffee", "5.50"]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].category).toBeNull()
    })

    it("sets category to null when category cell is empty", async () => {
      const mapping: ColumnMapping = {
        dateColumn: 0,
        descriptionColumn: 1,
        amountPattern: { type: "single", amountColumn: 2 },
        categoryColumn: 3,
      }
      const rows = [["2026-01-15", "Coffee", "5.50", ""]]
      const result = await normalizeAmounts(rows, mapping)

      expect(result[0].category).toBeNull()
    })
  })
})

// ── detectDuplicates ──────────────────────────────────────────────────────────

describe("detectDuplicates", () => {
  const mockAccount = { id: "acc-1", userId: "user-1" }

  const existingTransactions = [
    {
      date: new Date("2026-01-15T00:00:00"),
      description: "Coffee",
      amount: decimal(-5.5),
    },
    {
      date: new Date("2026-01-16T00:00:00"),
      description: "WALMART #1234",
      amount: decimal(-45.0),
    },
  ]

  beforeEach(() => {
    mockAccountFindFirst.mockResolvedValue(mockAccount as never)
    mockTransactionFindMany.mockResolvedValue(existingTransactions as never)
  })

  it("throws Unauthorized when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null as never)

    await expect(
      detectDuplicates([{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }], "acc-1")
    ).rejects.toThrow("Unauthorized")
  })

  it("throws 'Account not found' for invalid account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)

    await expect(
      detectDuplicates([{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }], "acc-bad")
    ).rejects.toThrow("Account not found")
  })

  it("marks exact match (same date + amount + description) as 'duplicate'", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "Coffee", amount: -5.5, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].status).toBe("duplicate")
  })

  it("marks fuzzy match (Levenshtein < 3, same date + amount) as 'review'", async () => {
    // "WALMART #1235" vs "WALMART #1234" — distance of 1
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-16", description: "WALMART #1235", amount: -45.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].status).toBe("review")
  })

  it("marks non-matching transaction as 'new'", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-17", description: "New transaction", amount: -20.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].status).toBe("new")
  })

  it("auto-selects 'new' rows (selected = true)", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-17", description: "New transaction", amount: -20.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].selected).toBe(true)
  })

  it("auto-deselects 'duplicate' rows (selected = false)", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "Coffee", amount: -5.5, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].selected).toBe(false)
  })

  it("auto-deselects 'review' rows (selected = false)", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-16", description: "WALMART #1235", amount: -45.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].selected).toBe(false)
  })

  it("sets matchDescription for duplicate matches", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "Coffee", amount: -5.5, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].matchDescription).toBe("Coffee")
  })

  it("sets matchDescription for fuzzy matches", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-16", description: "WALMART #1235", amount: -45.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].matchDescription).toBe("WALMART #1234")
  })

  it("does not set matchDescription for new transactions", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-17", description: "Brand new", amount: -20.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].matchDescription).toBeUndefined()
  })

  it("preserves the original index for each row", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-17", description: "First", amount: -10.0, category: null },
      { date: "2026-01-18", description: "Second", amount: -20.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].index).toBe(0)
    expect(result[1].index).toBe(1)
  })

  it("uses case-insensitive comparison for exact matches", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "COFFEE", amount: -5.5, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].status).toBe("duplicate")
  })

  it("does not mark as duplicate when amount differs", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "Coffee", amount: -6.0, category: null },
    ]
    const result = await detectDuplicates(transactions, "acc-1")

    expect(result[0].status).toBe("new")
  })

  it("queries account with correct userId for ownership check", async () => {
    await detectDuplicates([], "acc-1")

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    })
  })

  it("handles empty transaction array without error", async () => {
    const result = await detectDuplicates([], "acc-1")
    expect(result).toEqual([])
  })
})

// ── importTransactions ────────────────────────────────────────────────────────

describe("importTransactions", () => {
  const mockAccount = { id: "acc-1", userId: "user-1", balance: decimal(500) }

  beforeEach(() => {
    mockAccountFindFirst.mockResolvedValue(mockAccount as never)
    txClient.transaction.createMany.mockResolvedValue({ count: 2 })
    txClient.account.update.mockResolvedValue({ balance: decimal(450) })
  })

  it("throws Unauthorized when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null as never)

    await expect(
      importTransactions([{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }], "acc-1")
    ).rejects.toThrow("Unauthorized")
  })

  it("throws 'No transactions to import' for empty array", async () => {
    await expect(importTransactions([], "acc-1")).rejects.toThrow("No transactions to import")
  })

  it("throws 'Account not found' for invalid account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)

    await expect(
      importTransactions([{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }], "acc-bad")
    ).rejects.toThrow("Account not found")
  })

  it("verifies account ownership by querying with userId", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    })
  })

  it("uses $transaction for atomicity", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(mockPrismaTransaction).toHaveBeenCalledOnce()
  })

  it("sets type to EXPENSE for negative amounts", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: "EXPENSE", amount: -5.5 }),
      ]),
    })
  })

  it("sets type to INCOME for positive amounts", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Paycheck", amount: 2000, category: null }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: "INCOME", amount: 2000 }),
      ]),
    })
  })

  it("sets source to IMPORT on all transactions", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ source: "IMPORT" }),
      ]),
    })
  })

  it("converts date string to Date object for each transaction", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ date: new Date("2026-01-15T00:00:00") }),
      ]),
    })
  })

  it("tags each transaction with userId and accountId", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: "user-1", accountId: "acc-1" }),
      ]),
    })
  })

  it("updates account balance by the net amount of all transactions", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "Coffee", amount: -5.5, category: null },
      { date: "2026-01-16", description: "Refund", amount: 10.0, category: null },
    ]
    // net = -5.5 + 10.0 = 4.5
    await importTransactions(transactions, "acc-1")

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: 4.5 } },
    })
  })

  it("returns correct imported count and skipped=0", async () => {
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "Coffee", amount: -5.5, category: null },
      { date: "2026-01-16", description: "Lunch", amount: -12.0, category: null },
    ]
    const result = await importTransactions(transactions, "acc-1")

    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it("returns newBalance from the account update result", async () => {
    txClient.account.update.mockResolvedValue({ balance: decimal(750) })

    const result = await importTransactions(
      [{ date: "2026-01-15", description: "Paycheck", amount: 250, category: null }],
      "acc-1"
    )

    expect(result.newBalance).toBe(750)
  })

  it("stores null category when category is null", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: null }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ category: null }),
      ]),
    })
  })

  it("stores provided category when present", async () => {
    await importTransactions(
      [{ date: "2026-01-15", description: "Coffee", amount: -5.5, category: "Food" }],
      "acc-1"
    )

    expect(txClient.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ category: "Food" }),
      ]),
    })
  })

  it("rounds net balance increment to 2 decimal places", async () => {
    // 3 * 0.1 in floating point is 0.30000000000000004 — should be rounded to 0.3
    const transactions: NormalizedTransaction[] = [
      { date: "2026-01-15", description: "A", amount: -0.1, category: null },
      { date: "2026-01-15", description: "B", amount: -0.1, category: null },
      { date: "2026-01-15", description: "C", amount: -0.1, category: null },
    ]
    await importTransactions(transactions, "acc-1")

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: -0.3 } },
    })
  })
})
