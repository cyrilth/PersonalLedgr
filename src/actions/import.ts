"use server"

/**
 * Server actions for CSV import functionality.
 *
 * Supports three amount column patterns commonly found in bank CSV exports:
 *   Pattern 1: Single signed amount column (positive/negative values)
 *   Pattern 2: Separate debit/credit columns
 *   Pattern 3: Amount column + type indicator column (e.g., "DR"/"CR")
 *
 * The import pipeline: parse CSV → detect columns → detect amount pattern →
 * normalize amounts → detect duplicates → bulk insert confirmed transactions.
 *
 * Key patterns:
 * - All amounts are normalized to signed values: negative = debit/expense, positive = credit/income
 * - Duplicate detection uses exact match (date+amount+description) and fuzzy match (Levenshtein < 3)
 * - Imported transactions use source = "IMPORT" and type = EXPENSE (negative) or INCOME (positive)
 * - Account balance is updated atomically with the transaction insert via Prisma $transaction
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { levenshtein } from "@/lib/import-utils"

// ── Helpers ──────────────────────────────────────────────────────────

/** Extracts the authenticated user's ID from the session cookie. */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

// ── Types ────────────────────────────────────────────────────────────

/** A single row parsed from CSV — array of string values. */
export type CSVRow = string[]

/** Result of parsing a CSV file. */
export interface ParsedCSV {
  headers: string[]
  rows: CSVRow[]
}

/** Amount pattern detection result. */
export type AmountPattern =
  | { type: "single"; amountColumn: number }
  | { type: "separate"; debitColumn: number; creditColumn: number }
  | { type: "indicator"; amountColumn: number; indicatorColumn: number; debitValues: string[] }

/** Column mapping configuration. */
export interface ColumnMapping {
  dateColumn: number
  descriptionColumn: number
  categoryColumn?: number
  amountPattern: AmountPattern
}

/** Detected column suggestion from header analysis. */
export interface DetectedColumns {
  dateColumn: number | null
  descriptionColumn: number | null
  categoryColumn: number | null
  amountPattern: AmountPattern | null
}

/** A normalized transaction ready for duplicate detection and import. */
export interface NormalizedTransaction {
  date: string
  description: string
  amount: number
  category: string | null
}

/** Duplicate detection status for a transaction row. */
export type DuplicateStatus = "new" | "duplicate" | "review" | "reconcile"

/** Info about a bill payment that can be reconciled with an imported transaction. */
export interface ReconcileMatch {
  transactionId: string
  billPaymentId?: string       // only for bills
  billName: string             // display name (bill name, loan name, or CC name)
  type: "bill" | "loan" | "credit_card"
  linkedTransactionId?: string // for loans/CCs: the other side of the transfer
}

/** A transaction row with its duplicate detection result. */
export interface ImportRow {
  index: number
  date: string
  description: string
  amount: number
  category: string | null
  status: DuplicateStatus
  matchDescription?: string
  reconcileMatch?: ReconcileMatch
  reconcileCandidates?: ReconcileMatch[]
  selected: boolean
}

/** Summary of the import operation result. */
export interface ImportResult {
  imported: number
  reconciled: number
  skipped: number
  newBalance: number
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Parses a CSV string into headers and data rows.
 *
 * Handles common CSV edge cases:
 * - Quoted fields containing commas and newlines
 * - BOM (byte order mark) stripping
 * - Empty trailing rows/columns
 * - Both \r\n and \n line endings
 *
 * @param fileContent Raw CSV file content as a string
 * @returns Parsed headers and data rows
 * @throws "CSV file is empty" if no data rows exist
 */
export async function parseCSV(fileContent: string): Promise<ParsedCSV> {
  // Strip BOM if present
  let content = fileContent
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }

  const rows = parseCSVRows(content)

  // Filter out completely empty rows
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.trim() !== ""))

  if (nonEmptyRows.length < 2) {
    throw new Error("CSV file is empty")
  }

  const headers = nonEmptyRows[0].map((h) => h.trim())
  const dataRows = nonEmptyRows.slice(1)

  return { headers, rows: dataRows }
}

/**
 * RFC 4180-compatible CSV row parser.
 * Handles quoted fields with embedded commas, newlines, and escaped quotes.
 */
function parseCSVRows(content: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  while (i < content.length) {
    const char = content[i]

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < content.length && content[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        // End of quoted field
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
    } else {
      if (char === '"') {
        inQuotes = true
        i++
      } else if (char === ",") {
        current.push(field)
        field = ""
        i++
      } else if (char === "\r") {
        // Handle \r\n and bare \r
        current.push(field)
        field = ""
        rows.push(current)
        current = []
        i++
        if (i < content.length && content[i] === "\n") i++
      } else if (char === "\n") {
        current.push(field)
        field = ""
        rows.push(current)
        current = []
        i++
      } else {
        field += char
        i++
      }
    }
  }

  // Push last field/row
  if (field || current.length > 0) {
    current.push(field)
    rows.push(current)
  }

  return rows
}

/**
 * Auto-detects date, description, and amount columns from CSV headers.
 *
 * Uses name heuristics: common header names for date (Date, Transaction Date, Post Date),
 * description (Description, Memo, Payee), category (Category, Type), and amount fields
 * (Amount, Debit, Credit, Withdrawal, Deposit).
 *
 * Also attempts to detect the amount pattern (single, separate debit/credit, or indicator).
 *
 * @param csvHeaders Array of header strings from the CSV
 * @param sampleRows First few data rows for pattern validation
 */
export async function detectColumns(
  csvHeaders: string[],
  sampleRows: CSVRow[]
): Promise<DetectedColumns> {
  const lower = csvHeaders.map((h) => h.toLowerCase().trim())

  // Date column detection
  const datePatterns = ["date", "transaction date", "trans date", "post date", "posting date", "trans. date"]
  const dateColumn = lower.findIndex((h) => datePatterns.includes(h))

  // Description column detection
  const descPatterns = ["description", "desc", "memo", "payee", "narrative", "details", "transaction description"]
  const descriptionColumn = lower.findIndex((h) => descPatterns.includes(h))

  // Category column detection
  const catPatterns = ["category", "type", "classification"]
  const categoryColumn = lower.findIndex((h) => catPatterns.includes(h))

  // Amount pattern detection
  const amountPattern = detectAmountPatternFromHeaders(lower, sampleRows)

  return {
    dateColumn: dateColumn >= 0 ? dateColumn : null,
    descriptionColumn: descriptionColumn >= 0 ? descriptionColumn : null,
    categoryColumn: categoryColumn >= 0 ? categoryColumn : null,
    amountPattern,
  }
}

/**
 * Detects which of the 3 amount patterns a CSV uses from headers and sample data.
 *
 * Pattern 1 (single signed amount): looks for "Amount" column with mixed positive/negative values
 * Pattern 2 (separate debit/credit): looks for both debit and credit columns
 * Pattern 3 (amount + type indicator): looks for amount column + a type/indicator column
 *
 * @param headers Lowercase header strings
 * @param sampleRows Sample data rows for validation
 */
export async function detectAmountPattern(
  headers: string[],
  sampleRows: CSVRow[]
): Promise<AmountPattern | null> {
  return detectAmountPatternFromHeaders(headers.map((h) => h.toLowerCase().trim()), sampleRows)
}

/**
 * Internal helper for amount pattern detection from lowercase headers.
 * Separated from the public function to allow reuse in detectColumns.
 */
function detectAmountPatternFromHeaders(
  lower: string[],
  sampleRows: CSVRow[]
): AmountPattern | null {
  // Pattern 2: Separate debit/credit columns
  const debitPatterns = ["debit", "withdrawal", "debit amount", "withdrawals"]
  const creditPatterns = ["credit", "deposit", "credit amount", "deposits"]

  const debitCol = lower.findIndex((h) => debitPatterns.includes(h))
  const creditCol = lower.findIndex((h) => creditPatterns.includes(h))

  if (debitCol >= 0 && creditCol >= 0) {
    return { type: "separate", debitColumn: debitCol, creditColumn: creditCol }
  }

  // Pattern 1/3: Look for an amount column
  const amountPatterns = ["amount", "transaction amount", "trans amount", "value"]
  const amountCol = lower.findIndex((h) => amountPatterns.includes(h))

  if (amountCol >= 0) {
    // Check for a type indicator column (Pattern 3)
    const indicatorPatterns = ["type", "dr/cr", "debit/credit", "indicator", "transaction type", "dr cr"]
    const indicatorCol = lower.findIndex((h) => indicatorPatterns.includes(h))

    if (indicatorCol >= 0 && indicatorCol !== amountCol) {
      // Verify the indicator column has debit/credit-like values
      const indicatorValues = new Set(
        sampleRows
          .map((row) => (row[indicatorCol] || "").trim().toUpperCase())
          .filter((v) => v !== "")
      )

      const debitIndicators = ["DR", "DEBIT", "D", "DB", "-"]
      const hasDebitIndicator = debitIndicators.some((d) => indicatorValues.has(d))

      if (hasDebitIndicator) {
        const detectedDebitValues = debitIndicators.filter((d) => indicatorValues.has(d))
        return {
          type: "indicator",
          amountColumn: amountCol,
          indicatorColumn: indicatorCol,
          debitValues: detectedDebitValues,
        }
      }
    }

    // Pattern 1: Check if amounts contain negative values (signed column)
    const hasNegative = sampleRows.some((row) => {
      const val = (row[amountCol] || "").trim().replace(/[$,]/g, "")
      return val.startsWith("-") || (val.startsWith("(") && val.endsWith(")"))
    })

    // Default to Pattern 1 (single amount column)
    // Even if no negatives found in sample, it's the most common pattern
    if (amountCol >= 0) {
      return { type: "single", amountColumn: amountCol }
    }
  }

  return null
}

/**
 * Normalizes parsed CSV rows into signed transaction amounts.
 *
 * Applies the column mapping and amount pattern to convert any CSV format
 * into a standard array of transactions with signed amounts where:
 * - Negative = debit/expense (money out)
 * - Positive = credit/income (money in)
 *
 * Handles common amount formatting: $, commas, parenthetical negatives, spaces.
 *
 * @param rows Parsed CSV data rows
 * @param mapping Column mapping configuration with amount pattern
 * @returns Array of normalized transactions
 */
export async function normalizeAmounts(
  rows: CSVRow[],
  mapping: ColumnMapping
): Promise<NormalizedTransaction[]> {
  const results: NormalizedTransaction[] = []

  for (const row of rows) {
    const dateStr = (row[mapping.dateColumn] || "").trim()
    const description = (row[mapping.descriptionColumn] || "").trim()

    if (!dateStr || !description) continue

    // Parse the date
    const date = parseDate(dateStr)
    if (!date) continue

    // Normalize amount based on pattern
    const amount = normalizeAmount(row, mapping.amountPattern)
    if (amount === null || amount === 0) continue

    const category = mapping.categoryColumn !== undefined
      ? (row[mapping.categoryColumn] || "").trim() || null
      : null

    results.push({
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      category,
    })
  }

  return results
}

/**
 * Parse a date string in common CSV date formats.
 * Supports: MM/DD/YYYY, YYYY-MM-DD, M/D/YYYY, DD/MM/YYYY (via heuristic).
 * Returns ISO date string "YYYY-MM-DD" or null if unparseable.
 */
function parseDate(str: string): string | null {
  const trimmed = str.trim()

  // YYYY-MM-DD (ISO format)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + "T00:00:00")
    if (!isNaN(d.getTime())) return trimmed
  }

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch
    const month = parseInt(part1, 10)
    const day = parseInt(part2, 10)

    // Heuristic: if first number > 12, assume DD/MM/YYYY
    if (month > 12 && day <= 12) {
      const d = new Date(parseInt(year, 10), day - 1, month)
      if (!isNaN(d.getTime())) {
        return `${year}-${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`
      }
    }

    const d = new Date(parseInt(year, 10), month - 1, day)
    if (!isNaN(d.getTime())) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }

  // MM/DD/YY
  const shortYearMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (shortYearMatch) {
    const [, m, d, y] = shortYearMatch
    const fullYear = parseInt(y, 10) + 2000
    const month = parseInt(m, 10)
    const day = parseInt(d, 10)
    const date = new Date(fullYear, month - 1, day)
    if (!isNaN(date.getTime())) {
      return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }

  return null
}

/**
 * Parse a numeric string, handling common CSV amount formatting:
 * - Dollar signs and commas: "$1,234.56" → 1234.56
 * - Parenthetical negatives: "(100.00)" → -100.00
 * - Whitespace
 */
function parseNumber(str: string): number | null {
  let cleaned = str.trim().replace(/[$,\s]/g, "")

  // Handle parenthetical negatives: (100.00) → -100.00
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1)
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * Extract and normalize the amount from a single row based on the detected pattern.
 * Returns negative for debits, positive for credits, or null if invalid.
 */
function normalizeAmount(row: CSVRow, pattern: AmountPattern): number | null {
  switch (pattern.type) {
    case "single": {
      const raw = row[pattern.amountColumn] || ""
      return parseNumber(raw)
    }

    case "separate": {
      const debitRaw = (row[pattern.debitColumn] || "").trim()
      const creditRaw = (row[pattern.creditColumn] || "").trim()
      const debit = debitRaw ? parseNumber(debitRaw) : null
      const credit = creditRaw ? parseNumber(creditRaw) : null

      if (debit !== null && debit !== 0) return -Math.abs(debit)
      if (credit !== null && credit !== 0) return Math.abs(credit)
      return null
    }

    case "indicator": {
      const amountRaw = row[pattern.amountColumn] || ""
      const indicator = (row[pattern.indicatorColumn] || "").trim().toUpperCase()
      const amount = parseNumber(amountRaw)

      if (amount === null) return null

      // If the indicator matches a debit value, ensure it's negative
      if (pattern.debitValues.includes(indicator)) {
        return -Math.abs(amount)
      }
      // Otherwise it's a credit, ensure positive
      return Math.abs(amount)
    }
  }
}

/**
 * Compares a list of normalized transactions against existing transactions in an account.
 *
 * Three detection levels:
 * - **Exact match** (duplicate): same date + same amount + same description
 * - **Fuzzy match** (review): same date + same amount + similar description (Levenshtein < 3)
 * - **No match** (new): no matching transaction found
 *
 * @param transactions Normalized transactions to check
 * @param accountId Target account to check against
 * @returns Array of ImportRow with duplicate status flags
 */
export async function detectDuplicates(
  transactions: NormalizedTransaction[],
  accountId: string
): Promise<ImportRow[]> {
  const userId = await requireUserId()

  // Verify account ownership
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  })
  if (!account) throw new Error("Account not found")

  // Fetch existing transactions for this account
  // Only load the fields we need for comparison
  const existing = await prisma.transaction.findMany({
    where: { accountId },
    select: {
      date: true,
      description: true,
      amount: true,
    },
  })

  // Build lookup structure: key = "YYYY-MM-DD|amount" → descriptions[]
  const existingLookup = new Map<string, string[]>()
  for (const t of existing) {
    const d = new Date(t.date)
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const key = `${dateKey}|${Number(t.amount)}`
    const descriptions = existingLookup.get(key) || []
    descriptions.push(t.description)
    existingLookup.set(key, descriptions)
  }

  // ── Bill payment reconciliation pass ──────────────────────────────
  // Find transactions on this account that have a linked BillPayment.
  // This includes RECURRING-source transactions as well as MANUAL transactions
  // that were linked to a bill via "link existing transaction".
  // All are candidates for reconciliation with imported expense rows.
  const transactionsWithBillPayments = await prisma.transaction.findMany({
    where: {
      accountId,
      source: { not: "IMPORT" },
    },
    include: {
      billPayment: {
        include: { recurringBill: { select: { name: true, isVariableAmount: true } } },
      },
    },
  })

  // Build lookup: absolute cents → array of reconciliation candidates
  const reconcileLookup = new Map<number, {
    transactionId: string
    date: Date
    billPaymentId?: string
    billName: string
    type: "bill" | "loan" | "credit_card"
    linkedTransactionId?: string
  }[]>()

  // Separate array for variable-amount bill candidates (fuzzy matching fallback)
  const variableBillCandidates: {
    cents: number
    transactionId: string
    date: Date
    billPaymentId: string
    billName: string
  }[] = []

  for (const t of transactionsWithBillPayments) {
    if (!t.billPayment) continue
    const cents = Math.round(Math.abs(Number(t.amount)) * 100)
    const entries = reconcileLookup.get(cents) || []
    entries.push({
      transactionId: t.id,
      date: new Date(t.date),
      billPaymentId: t.billPayment.id,
      billName: t.billPayment.recurringBill.name,
      type: "bill",
    })
    reconcileLookup.set(cents, entries)

    // Also add to variable candidates for fuzzy matching fallback
    if (t.billPayment.recurringBill.isVariableAmount) {
      variableBillCandidates.push({
        cents,
        transactionId: t.id,
        date: new Date(t.date),
        billPaymentId: t.billPayment.id,
        billName: t.billPayment.recurringBill.name,
      })
    }
  }

  // ── Loan & CC payment reconciliation pass ────────────────────────
  // Find non-IMPORT TRANSFER transactions on this account that are linked to
  // transactions on loan or CC accounts. These represent manually-entered or
  // system-created transfers that should be reconciled with imported rows.
  //
  // Loan transfers: linked to LOAN_PRINCIPAL on a LOAN/MORTGAGE account
  // CC transfers: linked to TRANSFER on a CREDIT_CARD account
  const linkedTransfers = await prisma.transaction.findMany({
    where: {
      accountId,
      type: "TRANSFER",
      source: { not: "IMPORT" },
      linkedTransactionId: { not: null },
    },
    select: {
      id: true,
      date: true,
      amount: true,
      linkedTransactionId: true,
      linkedTransaction: {
        select: {
          type: true,
          account: { select: { name: true, type: true } },
        },
      },
    },
  })

  for (const t of linkedTransfers) {
    if (!t.linkedTransaction) continue
    const linkedAcctType = t.linkedTransaction.account.type
    const linkedTxType = t.linkedTransaction.type

    // Loan payment: linked to LOAN_PRINCIPAL on a LOAN/MORTGAGE account
    if (
      (linkedAcctType === "LOAN" || linkedAcctType === "MORTGAGE") &&
      linkedTxType === "LOAN_PRINCIPAL"
    ) {
      const cents = Math.round(Math.abs(Number(t.amount)) * 100)
      const entries = reconcileLookup.get(cents) || []
      entries.push({
        transactionId: t.id,
        date: new Date(t.date),
        billName: t.linkedTransaction.account.name,
        type: "loan",
        linkedTransactionId: t.linkedTransactionId!,
      })
      reconcileLookup.set(cents, entries)
      continue
    }

    // CC payment: linked to TRANSFER on a CREDIT_CARD account
    if (linkedAcctType === "CREDIT_CARD" && linkedTxType === "TRANSFER") {
      const cents = Math.round(Math.abs(Number(t.amount)) * 100)
      const entries = reconcileLookup.get(cents) || []
      entries.push({
        transactionId: t.id,
        date: new Date(t.date),
        billName: t.linkedTransaction.account.name,
        type: "credit_card",
        linkedTransactionId: t.linkedTransactionId!,
      })
      reconcileLookup.set(cents, entries)
    }
  }

  // Track which transactions have already been matched
  const matchedRecurringIds = new Set<string>()

  const rows = transactions.map((t, index) => {
    const key = `${t.date}|${t.amount}`
    const matchingDescriptions = existingLookup.get(key) || []

    let status: DuplicateStatus = "new"
    let matchDescription: string | undefined

    for (const desc of matchingDescriptions) {
      // Exact match
      if (desc.toLowerCase() === t.description.toLowerCase()) {
        status = "duplicate"
        matchDescription = desc
        break
      }

      // Fuzzy match
      const distance = levenshtein(desc, t.description)
      if (distance < 3) {
        status = "review"
        matchDescription = desc
        // Don't break — keep looking for an exact match
      }
    }

    // Reconciliation pass: only for expense rows still marked "new"
    let reconcileMatch: ReconcileMatch | undefined
    let reconcileCandidates: ReconcileMatch[] | undefined
    if (status === "new" && t.amount < 0) {
      const cents = Math.round(Math.abs(t.amount) * 100)
      const candidates = reconcileLookup.get(cents) || []
      const importDate = new Date(t.date + "T00:00:00")

      const available: ReconcileMatch[] = []
      for (const candidate of candidates) {
        if (matchedRecurringIds.has(candidate.transactionId)) continue
        const sameMonth =
          importDate.getFullYear() === candidate.date.getFullYear() &&
          importDate.getMonth() === candidate.date.getMonth()
        if (sameMonth) {
          available.push({
            transactionId: candidate.transactionId,
            billPaymentId: candidate.billPaymentId,
            billName: candidate.billName,
            type: candidate.type,
            linkedTransactionId: candidate.linkedTransactionId,
          })
        }
      }

      // Fuzzy matching fallback: if no exact-cents match, check variable-amount bills
      // within ±20% of the estimated amount in the same month
      if (available.length === 0) {
        for (const candidate of variableBillCandidates) {
          if (matchedRecurringIds.has(candidate.transactionId)) continue
          const sameMonth =
            importDate.getFullYear() === candidate.date.getFullYear() &&
            importDate.getMonth() === candidate.date.getMonth()
          if (!sameMonth) continue
          const ratio = cents / candidate.cents
          if (ratio >= 0.8 && ratio <= 1.2) {
            available.push({
              transactionId: candidate.transactionId,
              billPaymentId: candidate.billPaymentId,
              billName: candidate.billName,
              type: "bill",
            })
          }
        }
      }

      if (available.length > 0) {
        status = "reconcile"
        reconcileCandidates = available
        reconcileMatch = available[0]
        matchedRecurringIds.add(available[0].transactionId)
      }
    }

    return {
      index,
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: t.category,
      status,
      matchDescription,
      reconcileMatch,
      reconcileCandidates,
      selected: status === "new" || status === "reconcile",
    }
  })

  return rows
}

/**
 * Bulk imports confirmed transactions into an account.
 *
 * Creates all transactions atomically and updates the account balance by the
 * net amount (sum of all imported transaction amounts). Each transaction gets:
 * - source: "IMPORT"
 * - type: EXPENSE (negative amount) or INCOME (positive amount)
 *
 * @param transactions Array of transactions to import (already normalized and confirmed)
 * @param accountId Target account ID
 * @returns Count of imported transactions, skipped count, and new account balance
 * @throws "Account not found" if the account doesn't exist or doesn't belong to the user
 * @throws "No transactions to import" if the input array is empty
 */
export async function importTransactions(
  transactions: NormalizedTransaction[],
  accountId: string
): Promise<ImportResult> {
  const userId = await requireUserId()

  if (transactions.length === 0) throw new Error("No transactions to import")

  // Verify account ownership
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  })
  if (!account) throw new Error("Account not found")

  // Calculate net amount for balance update
  const netAmount = transactions.reduce((sum, t) => sum + t.amount, 0)
  const roundedNet = Math.round(netAmount * 100) / 100

  // Atomic: create transactions + update balance
  const result = await prisma.$transaction(async (tx) => {
    // Bulk create transactions
    await tx.transaction.createMany({
      data: transactions.map((t) => ({
        date: new Date(t.date + "T00:00:00"),
        description: t.description,
        amount: t.amount,
        type: t.amount < 0 ? "EXPENSE" : "INCOME",
        category: t.category || null,
        source: "IMPORT",
        userId,
        accountId,
      })),
    })

    // Update account balance
    const updated = await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: roundedNet } },
    })

    return { newBalance: Number(updated.balance) }
  })

  return {
    imported: transactions.length,
    reconciled: 0,
    skipped: 0,
    newBalance: result.newBalance,
  }
}

/**
 * Imports new transactions and reconciles bill payment matches in a single atomic operation.
 *
 * For reconciled rows: creates the IMPORT transaction, re-points the BillPayment record,
 * and deletes the old RECURRING transaction. Net balance effect is zero for reconciled items
 * since the amounts are identical.
 *
 * For new rows: creates IMPORT transactions and adjusts balance normally.
 */
export async function importAndReconcile(
  newTransactions: NormalizedTransaction[],
  reconcileItems: { transaction: NormalizedTransaction; reconcileMatch: ReconcileMatch }[],
  accountId: string
): Promise<ImportResult> {
  const userId = await requireUserId()

  if (newTransactions.length === 0 && reconcileItems.length === 0) {
    throw new Error("No transactions to import")
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  })
  if (!account) throw new Error("Account not found")

  // New transactions always change the balance.
  // Reconciled items may also change the balance when a variable-amount bill's
  // actual imported amount differs from the estimated RECURRING transaction amount.
  const netAmount = newTransactions.reduce((sum, t) => sum + t.amount, 0)

  // Pre-fetch old RECURRING transaction amounts for reconciled bill items
  // so we can calculate the balance delta (imported amount - old amount).
  const billReconcileIds = reconcileItems
    .filter((item) => item.reconcileMatch.type === "bill")
    .map((item) => item.reconcileMatch.transactionId)

  let reconcileDelta = 0
  if (billReconcileIds.length > 0) {
    const oldTransactions = await prisma.transaction.findMany({
      where: { id: { in: billReconcileIds } },
      select: { id: true, amount: true },
    })
    const oldAmountMap = new Map(oldTransactions.map((t) => [t.id, Number(t.amount)]))
    for (const item of reconcileItems) {
      if (item.reconcileMatch.type !== "bill") continue
      const oldAmount = oldAmountMap.get(item.reconcileMatch.transactionId) ?? 0
      reconcileDelta += item.transaction.amount - oldAmount
    }
  }

  const roundedNet = Math.round((netAmount + reconcileDelta) * 100) / 100

  const result = await prisma.$transaction(async (tx) => {
    // Bulk-create new (non-reconcile) transactions
    if (newTransactions.length > 0) {
      await tx.transaction.createMany({
        data: newTransactions.map((t) => ({
          date: new Date(t.date + "T00:00:00"),
          description: t.description,
          amount: t.amount,
          type: t.amount < 0 ? "EXPENSE" : "INCOME",
          category: t.category || null,
          source: "IMPORT",
          userId,
          accountId,
        })),
      })
    }

    // Process each reconciliation
    for (const item of reconcileItems) {
      const t = item.transaction
      const match = item.reconcileMatch

      if (match.type === "bill") {
        // Bill reconciliation: create IMPORT tx, re-point BillPayment, delete old RECURRING tx
        const newTx = await tx.transaction.create({
          data: {
            date: new Date(t.date + "T00:00:00"),
            description: t.description,
            amount: t.amount,
            type: t.amount < 0 ? "EXPENSE" : "INCOME",
            category: t.category || null,
            source: "IMPORT",
            userId,
            accountId,
          },
        })

        if (match.billPaymentId) {
          await tx.billPayment.update({
            where: { id: match.billPaymentId },
            data: { transactionId: newTx.id },
          })
        }

        await tx.transaction.delete({
          where: { id: match.transactionId },
        })
      } else {
        // Loan/CC reconciliation: replace old transfer with IMPORT tx, re-link the other side.
        // Both loan and CC reconciliations follow the same pattern — there's a TRANSFER on
        // the import account linked to a transaction on the loan/CC account.
        // Net balance effect is zero (delete old -amount, create new -amount).

        // 1. Unlink the other side first (avoids unique constraint on linkedTransactionId)
        if (match.linkedTransactionId) {
          await tx.transaction.update({
            where: { id: match.linkedTransactionId },
            data: { linkedTransactionId: null },
          })
        }

        // 2. Delete the old manual/system transfer on the import account
        await tx.transaction.delete({
          where: { id: match.transactionId },
        })

        // 3. Create the new IMPORT transaction with the link
        const newTx = await tx.transaction.create({
          data: {
            date: new Date(t.date + "T00:00:00"),
            description: t.description,
            amount: t.amount,
            type: "TRANSFER",
            category: t.category || null,
            source: "IMPORT",
            userId,
            accountId,
            linkedTransactionId: match.linkedTransactionId || null,
          },
        })

        // 4. Update the linked transaction to point back to the new IMPORT transaction
        if (match.linkedTransactionId) {
          await tx.transaction.update({
            where: { id: match.linkedTransactionId },
            data: { linkedTransactionId: newTx.id },
          })
        }
      }
    }

    // Update account balance (only net of new transactions)
    const updated = await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: roundedNet } },
    })

    return { newBalance: Number(updated.balance) }
  })

  return {
    imported: newTransactions.length,
    reconciled: reconcileItems.length,
    skipped: 0,
    newBalance: result.newBalance,
  }
}
