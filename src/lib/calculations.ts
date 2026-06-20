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
 * Phased-repayment prefix for a loan schedule (student/personal loans).
 *
 * Option B semantics: these phases run BEFORE the regular amortization term, so
 * total loan life = defermentMonths + interestOnlyMonths + the amortization term.
 */
export interface LoanPhaseOptions {
  /** Phase 1: months with no payment due (in-school deferment / grace period). */
  defermentMonths?: number
  /** Phase 2: months paying interest only, with principal held flat. */
  interestOnlyMonths?: number
  /**
   * When true the loan is subsidized — interest does NOT accrue during deferment
   * (the balance stays flat). When false (default, e.g. private/unsubsidized
   * loans like SoFi) interest accrues and capitalizes into the balance each
   * deferment month.
   */
  subsidized?: boolean
}

/**
 * Hard ceiling on each phase length (deferment, interest-only). These loops have
 * no payoff-based early exit, so an absurd persisted value would otherwise make
 * the schedule — and every page that renders it — iterate without bound. 600
 * months = 50 years, far beyond any real phase, so clamping here is invisible to
 * legitimate loans while making a fat-fingered value harmless.
 */
export const MAX_PHASE_MONTHS = 600

/**
 * Validates the optional deferment / interest-only month inputs shared by every
 * loan write path (createLoan/updateLoan and createAccount/updateAccount), so
 * both entry points reject identical values rather than diverging or letting a
 * bad value reach Prisma's Int column. Null/undefined means "not set" (valid).
 * Rejects non-integers too (NaN, fractions) — `Number.isInteger(NaN)` is false —
 * which a hand-rolled `< 0 || > MAX` range check silently lets through.
 */
export function validatePhaseMonths(phases: {
  defermentMonths?: number | null
  interestOnlyMonths?: number | null
}): void {
  const check = (value: number | null | undefined, label: string) => {
    if (value == null) return
    if (!Number.isInteger(value) || value < 0 || value > MAX_PHASE_MONTHS) {
      throw new Error(`${label} must be between 0 and ${MAX_PHASE_MONTHS} months`)
    }
  }
  check(phases.defermentMonths, "Deferment period")
  check(phases.interestOnlyMonths, "Interest-only period")
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
 * When `options` describes a deferment and/or interest-only prefix, those
 * phases are emitted first (Option B): deferment months have a $0 payment (with
 * interest capitalizing into the balance unless the loan is subsidized),
 * interest-only months pay just the accruing interest with principal held flat,
 * and only then does `remainingMonths` of regular amortization begin — on the
 * possibly-larger capitalized balance. With no options the output is identical
 * to a plain amortization schedule.
 *
 * @param balance - Current outstanding balance (positive or negative; abs value used)
 * @param apr - Annual percentage rate (e.g., 6.5 for 6.5%)
 * @param monthlyPayment - Regular monthly payment amount
 * @param remainingMonths - Maximum number of amortization (phase 3) months to generate
 * @param options - Optional deferment / interest-only prefix (LoanPhaseOptions)
 * @returns Array of AmortizationRow entries, one per month until payoff or term end
 */
export function generateAmortizationSchedule(
  balance: number,
  apr: number,
  monthlyPayment: number,
  remainingMonths: number,
  options: LoanPhaseOptions = {}
): AmortizationRow[] {
  const schedule: AmortizationRow[] = []
  let remaining = Math.abs(balance)
  const monthlyRate = apr / 100 / 12

  // Clamp to a sane ceiling so an out-of-range persisted value can't make these
  // (early-exit-free) phase loops run away. See MAX_PHASE_MONTHS.
  const defermentMonths = Math.min(MAX_PHASE_MONTHS, Math.max(0, Math.floor(options.defermentMonths ?? 0)))
  const interestOnlyMonths = Math.min(MAX_PHASE_MONTHS, Math.max(0, Math.floor(options.interestOnlyMonths ?? 0)))
  const subsidized = options.subsidized ?? false

  let month = 1

  // Phase 1 — deferment: no payment is due. On unsubsidized loans the accruing
  // interest capitalizes into the balance each month (balance grows); subsidized
  // loans stay flat. A $0-payment row with interest accruing mirrors how a real
  // in-school deferment statement reads.
  for (let i = 0; i < defermentMonths; i++, month++) {
    const interest = subsidized ? 0 : Math.round(remaining * monthlyRate * 100) / 100
    if (!subsidized) remaining = Math.round((remaining + interest) * 100) / 100
    schedule.push({
      month,
      payment: 0,
      principal: 0,
      interest,
      remainingBalance: remaining,
    })
  }

  // Phase 2 — interest-only: pay just the accruing interest; principal is flat.
  for (let i = 0; i < interestOnlyMonths && remaining > 0.005; i++, month++) {
    const interest = Math.round(remaining * monthlyRate * 100) / 100
    schedule.push({
      month,
      payment: interest,
      principal: 0,
      interest,
      remainingBalance: remaining,
    })
  }

  // Phase 3 — regular amortization over the remaining term.
  for (let i = 0; i < remainingMonths && remaining > 0.005; i++, month++) {
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
 * @param options - Optional remaining deferment / interest-only phases (from today)
 * @returns Total interest remaining over the life of the loan, rounded to cents
 */
export function calculateTotalInterestRemaining(
  balance: number,
  apr: number,
  monthlyPayment: number,
  options: LoanPhaseOptions = {}
): number {
  const MAX_MONTHS = 600
  const schedule = generateAmortizationSchedule(balance, apr, monthlyPayment, MAX_MONTHS, options)
  const total = schedule.reduce((sum, row) => sum + row.interest, 0)
  return Math.round(total * 100) / 100
}

/**
 * Given a loan's start date and its ORIGINAL deferment / interest-only phase
 * lengths, returns how many months of each phase remain as of `asOf`.
 *
 * Used to project interest/payoff forward from today (the current balance)
 * rather than from origination: e.g. a 12-month deferment that started 5 months
 * ago has 7 deferment months left, with the full interest-only phase still ahead.
 *
 * @param startDate - The loan's origination date
 * @param defermentMonths - Original deferment length in months
 * @param interestOnlyMonths - Original interest-only length in months
 * @param asOf - The reference date (defaults to now)
 * @returns Remaining { defermentMonths, interestOnlyMonths } from `asOf` forward
 */
export function remainingLoanPhases(
  startDate: Date | string,
  defermentMonths: number,
  interestOnlyMonths: number,
  asOf: Date = new Date()
): { defermentMonths: number; interestOnlyMonths: number } {
  const start = new Date(startDate)
  // Whole calendar months elapsed since origination.
  const elapsed =
    (asOf.getFullYear() - start.getFullYear()) * 12 +
    (asOf.getMonth() - start.getMonth())
  const def = Math.max(0, Math.floor(defermentMonths || 0))
  const io = Math.max(0, Math.floor(interestOnlyMonths || 0))
  const elapsedNonNeg = Math.max(0, elapsed)
  return {
    defermentMonths: Math.max(0, def - elapsedNonNeg),
    interestOnlyMonths: Math.max(0, io - Math.max(0, elapsedNonNeg - def)),
  }
}

/**
 * Splits the lifetime interest of an origination-based amortization schedule
 * into the portion already paid and the portion remaining, using elapsed time.
 *
 * Months strictly before `elapsedMonths` are treated as already paid; the
 * current period and everything after are treated as remaining. This is used
 * to estimate interest paid to date for loans that were imported mid-life with
 * no logged payment history (where the actual paid amount is unknown).
 *
 * @param originalBalance - The loan's original (origination) balance
 * @param apr - Annual percentage rate (e.g., 6.5 for 6.5%)
 * @param monthlyPayment - Regular monthly payment amount
 * @param termMonths - Full original amortization term in months
 * @param elapsedMonths - 1-based current payment period (months since start)
 * @param options - Optional ORIGINAL deferment / interest-only phases (from origination)
 * @returns Estimated interest { paid, remaining }, each rounded to cents
 */
export function splitScheduledInterest(
  originalBalance: number,
  apr: number,
  monthlyPayment: number,
  termMonths: number,
  elapsedMonths: number,
  options: LoanPhaseOptions = {}
): { paid: number; remaining: number } {
  const schedule = generateAmortizationSchedule(originalBalance, apr, monthlyPayment, termMonths, options)
  let paid = 0
  let remaining = 0
  for (const row of schedule) {
    if (row.month < elapsedMonths) {
      // Only interest that was actually paid counts toward "paid". Deferment
      // rows carry capitalized interest with a $0 payment (charged, not paid),
      // so they're excluded; interest-only and amortization rows count.
      if (row.payment > 0) paid += row.interest
    } else {
      remaining += row.interest
    }
  }
  return {
    paid: Math.round(paid * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
  }
}

// ── Payday Loan Calculations ────────────────────────────────────────

/** Calculate the flat fee for a payday loan given principal and fee-per-$100. */
export function calculatePaydayFee(principal: number, feePerHundred: number): number {
  return Math.round(principal * (feePerHundred / 100) * 100) / 100
}

/** Calculate the equivalent APR for a payday loan for display purposes. */
export function calculatePaydayAPR(feePerHundred: number, termDays: number): number {
  if (termDays <= 0) return 0
  return Math.round((feePerHundred / 100) * (365 / termDays) * 100 * 100) / 100
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
