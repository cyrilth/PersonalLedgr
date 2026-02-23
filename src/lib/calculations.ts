/**
 * Pure business logic functions extracted from server actions.
 *
 * Every function here is zero-I/O and zero-side-effects — they take
 * pre-fetched data and return computed results. This makes them
 * trivially testable without mocking Prisma, auth, or Next.js headers.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface AccountSummary {
  id: string
  name: string
  type: string
  balance: number
  creditLimit: number | null
  owner: string | null
  isActive: boolean
}

export interface AccountGroup {
  type: string
  label: string
  accounts: AccountSummary[]
  total: number
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert Prisma Decimal (or any unknown value) to a plain JS number. */
export function toNumber(d: unknown): number {
  return Number(d)
}

// ── Balance History ──────────────────────────────────────────────────

/**
 * Computes monthly end-of-month balances by walking backwards from the current balance.
 *
 * Algorithm:
 * 1. Start with currentBalance as the most recent month's value
 * 2. Walk backwards through monthKeys, subtracting each month's transaction total
 *    to derive the prior month's ending balance
 *
 * @param currentBalance - The account's current stored balance
 * @param monthlyTotals - Map of "YYYY-MM" → sum of transaction amounts for that month
 * @param monthKeys - Chronologically ordered array of "YYYY-MM" keys
 * @returns Array sorted chronologically: [{ date: "2025-03", balance: 1234.56 }, ...]
 */
export function computeBalanceHistory(
  currentBalance: number,
  monthlyTotals: Record<string, number>,
  monthKeys: string[]
): { date: string; balance: number }[] {
  const history: { date: string; balance: number }[] = []
  let runningBalance = currentBalance

  for (let i = monthKeys.length - 1; i >= 0; i--) {
    history.unshift({ date: monthKeys[i], balance: Math.round(runningBalance * 100) / 100 })
    const monthSum = monthlyTotals[monthKeys[i]] || 0
    runningBalance -= monthSum
  }

  return history
}

// ── Account Grouping ────────────────────────────────────────────────

/**
 * Groups a flat array of accounts into ordered typed groups with totals.
 *
 * @param accounts - Flat array of account summaries
 * @param typeOrder - Desired display order of account types
 * @param labelMap - Maps account type enum → human-readable label
 * @returns Array of AccountGroup, only including types that have accounts
 */
export function groupAccountsByType(
  accounts: AccountSummary[],
  typeOrder: string[],
  labelMap: Record<string, string>
): AccountGroup[] {
  const grouped: Record<string, AccountSummary[]> = {}
  for (const a of accounts) {
    const type = a.type as string
    if (!grouped[type]) grouped[type] = []
    grouped[type].push(a)
  }

  return typeOrder
    .filter((t) => grouped[t])
    .map((t) => ({
      type: t,
      label: labelMap[t],
      accounts: grouped[t],
      total: grouped[t].reduce((sum, a) => sum + a.balance, 0),
    }))
}

// ── Drift Calculation ───────────────────────────────────────────────

/** Compute the difference between a calculated and stored balance, rounded to cents. */
export function computeDrift(stored: number, calculated: number): number {
  return Math.round((calculated - stored) * 100) / 100
}

// ── Net Worth ───────────────────────────────────────────────────────

/** Account shape needed for net worth computation. */
interface BalanceWithType {
  balance: number
  type: string
}

const LIABILITY_TYPES = ["CREDIT_CARD", "LOAN", "MORTGAGE"]

/**
 * Splits accounts into assets and liabilities, returning summed totals.
 *
 * Liabilities (CC, loan, mortgage) are stored as negative balances,
 * so netWorth = assets + liabilities (liabilities already negative).
 */
export function computeNetWorth(accounts: BalanceWithType[]): {
  assets: number
  liabilities: number
  netWorth: number
} {
  let assets = 0
  let liabilities = 0

  for (const a of accounts) {
    if (LIABILITY_TYPES.includes(a.type)) {
      liabilities += a.balance
    } else {
      assets += a.balance
    }
  }

  return { assets, liabilities, netWorth: assets + liabilities }
}

// ── Credit Utilization ──────────────────────────────────────────────

/**
 * Compute credit utilization as a percentage, rounded to 2 decimal places.
 * Returns 0 if limit is zero or negative.
 */
export function computeUtilization(balance: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.round((balance / limit) * 100 * 100) / 100
}
