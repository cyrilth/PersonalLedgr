/**
 * Application-wide constants for enums, categories, and display labels.
 *
 * These mirror the Prisma enums defined in schema.prisma but live here so
 * client components can reference them without importing Prisma directly.
 * The SPENDING_TYPES and INCOME_TYPES arrays encode the core architecture
 * principle: transfers are NEVER income or expense.
 */

// ── Transaction Types ────────────────────────────────────────────────
// Must match Prisma enum TransactionType in schema.prisma

export const TRANSACTION_TYPES = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  TRANSFER: "TRANSFER",
  LOAN_PRINCIPAL: "LOAN_PRINCIPAL",
  LOAN_INTEREST: "LOAN_INTEREST",
  INTEREST_EARNED: "INTEREST_EARNED",
  INTEREST_CHARGED: "INTEREST_CHARGED",
} as const

export type TransactionType =
  (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES]

/**
 * Types that count as real spending in reports.
 * TRANSFER, LOAN_PRINCIPAL are excluded — they move money between accounts
 * but don't represent actual spending.
 */
export const SPENDING_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.EXPENSE,
  TRANSACTION_TYPES.LOAN_INTEREST,
  TRANSACTION_TYPES.INTEREST_CHARGED,
]

/**
 * Types that count as real income in reports.
 * TRANSFER is excluded — receiving a transfer is not income.
 */
export const INCOME_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.INCOME,
  TRANSACTION_TYPES.INTEREST_EARNED,
]

// ── Account Types ───────────────────────────────────────────────────

export const ACCOUNT_TYPES = {
  CHECKING: "CHECKING",
  SAVINGS: "SAVINGS",
  CREDIT_CARD: "CREDIT_CARD",
  LOAN: "LOAN",
  MORTGAGE: "MORTGAGE",
} as const

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES]

// ── Transaction Sources ─────────────────────────────────────────────

export const TRANSACTION_SOURCES = {
  MANUAL: "MANUAL",
  IMPORT: "IMPORT",
  PLAID: "PLAID",
  RECURRING: "RECURRING",
  SYSTEM: "SYSTEM",
} as const

export type TransactionSource =
  (typeof TRANSACTION_SOURCES)[keyof typeof TRANSACTION_SOURCES]

// ── Loan Types ──────────────────────────────────────────────────────

export const LOAN_TYPES = {
  MORTGAGE: "MORTGAGE",
  AUTO: "AUTO",
  STUDENT: "STUDENT",
  PERSONAL: "PERSONAL",
  BNPL: "BNPL",
} as const

export type LoanType = (typeof LOAN_TYPES)[keyof typeof LOAN_TYPES]

// ── Recurring Frequencies ───────────────────────────────────────────

export const RECURRING_FREQUENCIES = {
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  ANNUAL: "ANNUAL",
} as const

export type RecurringFrequency =
  (typeof RECURRING_FREQUENCIES)[keyof typeof RECURRING_FREQUENCIES]

// ── Interest Log Types ──────────────────────────────────────────────

export const INTEREST_LOG_TYPES = {
  CHARGED: "CHARGED",
  EARNED: "EARNED",
} as const

export type InterestLogType =
  (typeof INTEREST_LOG_TYPES)[keyof typeof INTEREST_LOG_TYPES]

// ── APR Rate Types ──────────────────────────────────────────────────

export const APR_RATE_TYPES = {
  STANDARD: "STANDARD",
  INTRO: "INTRO",
  BALANCE_TRANSFER: "BALANCE_TRANSFER",
  CASH_ADVANCE: "CASH_ADVANCE",
  PENALTY: "PENALTY",
  PROMOTIONAL: "PROMOTIONAL",
} as const

export type AprRateType = (typeof APR_RATE_TYPES)[keyof typeof APR_RATE_TYPES]

// ── Categories ──────────────────────────────────────────────────────
// Default set of transaction categories. Users can add custom ones via settings (Phase 7).

export const DEFAULT_CATEGORIES = [
  "Housing",
  "Utilities",
  "Groceries",
  "Dining Out",
  "Transportation",
  "Gas",
  "Insurance",
  "Healthcare",
  "Personal Care",
  "Clothing",
  "Entertainment",
  "Subscriptions",
  "Education",
  "Childcare",
  "Pets",
  "Gifts",
  "Donations",
  "Travel",
  "Home Improvement",
  "Electronics",
  "Salary",
  "Freelance",
  "Investment Income",
  "Refund",
  "Transfer",
  "Loan Payment",
  "Credit Card Payment",
  "Other",
] as const

// ── Display Labels ──────────────────────────────────────────────────
// Human-readable labels for enum values, used in UI dropdowns, tables, and badges.

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
  LOAN_PRINCIPAL: "Loan Principal",
  LOAN_INTEREST: "Loan Interest",
  INTEREST_EARNED: "Interest Earned",
  INTEREST_CHARGED: "Interest Charged",
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit Card",
  LOAN: "Loan",
  MORTGAGE: "Mortgage",
}

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  MORTGAGE: "Mortgage",
  AUTO: "Auto",
  STUDENT: "Student",
  PERSONAL: "Personal",
  BNPL: "Buy Now Pay Later",
}

export const APR_RATE_TYPE_LABELS: Record<AprRateType, string> = {
  STANDARD: "Standard",
  INTRO: "Introductory",
  BALANCE_TRANSFER: "Balance Transfer",
  CASH_ADVANCE: "Cash Advance",
  PENALTY: "Penalty",
  PROMOTIONAL: "Promotional",
}

export const TRANSACTION_SOURCE_LABELS: Record<TransactionSource, string> = {
  MANUAL: "Manual",
  IMPORT: "Import",
  PLAID: "Plaid",
  RECURRING: "Recurring",
  SYSTEM: "System",
}

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annually",
}
