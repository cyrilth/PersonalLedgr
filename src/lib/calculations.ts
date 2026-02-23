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

// ── Amortization Engine ─────────────────────────────────────────────

/** Result of splitting a single monthly payment into principal and interest portions. */
export interface PaymentSplit {
  principal: number
  interest: number
}

/** One row in an amortization schedule. */
export interface AmortizationRow {
  month: number
  payment: number
  principal: number
  interest: number
  remainingBalance: number
}

/** Result of comparing loan payoff with vs without extra monthly payments. */
export interface ExtraPaymentImpact {
  newPayoffMonths: number
  interestSaved: number
  newTotalInterest: number
}

/**
 * Splits a single monthly payment into principal and interest portions.
 *
 * Uses standard amortization math: monthly interest = |balance| * (apr / 100 / 12).
 * The remainder of the payment goes to principal. If the payment is less than
 * the interest due, all of it goes to interest (negative amortization scenario).
 * Works with negative balances (loans stored as negative) by using Math.abs().
 *
 * @param balance - Current loan balance (may be negative for owed amounts)
 * @param apr - Annual percentage rate (e.g., 6.5 for 6.5%)
 * @param monthlyPayment - Total monthly payment amount
 * @returns Split rounded to 2 decimal places
 */
export function calculatePaymentSplit(
  balance: number,
  apr: number,
  monthlyPayment: number
): PaymentSplit {
  const monthlyRate = apr / 100 / 12
  const interest = Math.round(Math.abs(balance) * monthlyRate * 100) / 100
  const principal = Math.round((monthlyPayment - interest) * 100) / 100

  return {
    principal: Math.max(principal, 0),
    interest: Math.min(interest, monthlyPayment),
  }
}

/**
 * Generates a full amortization schedule for the remaining life of a loan.
 *
 * Iterates month by month, splitting each payment into principal/interest,
 * reducing the balance until it reaches zero or remainingMonths is exhausted.
 * The final payment is adjusted to exactly pay off the remaining balance.
 *
 * @param balance - Current outstanding balance (positive or negative; abs value used)
 * @param apr - Annual percentage rate (e.g., 6.5 for 6.5%)
 * @param monthlyPayment - Regular monthly payment amount
 * @param remainingMonths - Maximum number of months to generate
 * @returns Array of AmortizationRow entries, one per month until payoff or term end
 */
export function generateAmortizationSchedule(
  balance: number,
  apr: number,
  monthlyPayment: number,
  remainingMonths: number
): AmortizationRow[] {
  const schedule: AmortizationRow[] = []
  let remaining = Math.abs(balance)
  const monthlyRate = apr / 100 / 12

  for (let month = 1; month <= remainingMonths && remaining > 0.005; month++) {
    const interest = Math.round(remaining * monthlyRate * 100) / 100

    // Final payment: cap at remaining balance + interest to avoid overpaying
    const payment = Math.min(monthlyPayment, remaining + interest)
    const principal = Math.round((payment - interest) * 100) / 100

    remaining = Math.round((remaining - principal) * 100) / 100

    schedule.push({
      month,
      payment: Math.round(payment * 100) / 100,
      principal,
      interest,
      remainingBalance: Math.max(remaining, 0),
    })
  }

  return schedule
}

/**
 * Calculates the impact of making extra monthly payments on a loan.
 *
 * Compares the total interest and payoff timeline with the extra payment
 * against the baseline (no extra payment). Uses generateAmortizationSchedule
 * internally with a high month cap (600 = 50 years) to find natural payoff.
 *
 * @param balance - Current outstanding balance
 * @param apr - Annual percentage rate
 * @param monthlyPayment - Base monthly payment (without extra)
 * @param extraMonthly - Additional amount to pay each month
 * @returns Months to payoff, interest saved, and new total interest
 */
export function calculateExtraPaymentImpact(
  balance: number,
  apr: number,
  monthlyPayment: number,
  extraMonthly: number
): ExtraPaymentImpact {
  const MAX_MONTHS = 600 // 50-year cap to prevent infinite loops

  const baseSchedule = generateAmortizationSchedule(balance, apr, monthlyPayment, MAX_MONTHS)
  const extraSchedule = generateAmortizationSchedule(balance, apr, monthlyPayment + extraMonthly, MAX_MONTHS)

  const baseTotalInterest = baseSchedule.reduce((sum, row) => sum + row.interest, 0)
  const newTotalInterest = extraSchedule.reduce((sum, row) => sum + row.interest, 0)

  return {
    newPayoffMonths: extraSchedule.length,
    interestSaved: Math.round((baseTotalInterest - newTotalInterest) * 100) / 100,
    newTotalInterest: Math.round(newTotalInterest * 100) / 100,
  }
}

/**
 * Calculates total remaining interest by summing interest from the amortization schedule.
 *
 * This is a pure computation — it does not query the database. For historical
 * interest already paid, use calculateTotalInterestPaid() in loans.ts instead.
 *
 * @param balance - Current outstanding balance
 * @param apr - Annual percentage rate
 * @param monthlyPayment - Regular monthly payment amount
 * @returns Total interest remaining over the life of the loan, rounded to cents
 */
export function calculateTotalInterestRemaining(
  balance: number,
  apr: number,
  monthlyPayment: number
): number {
  const MAX_MONTHS = 600
  const schedule = generateAmortizationSchedule(balance, apr, monthlyPayment, MAX_MONTHS)
  const total = schedule.reduce((sum, row) => sum + row.interest, 0)
  return Math.round(total * 100) / 100
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
