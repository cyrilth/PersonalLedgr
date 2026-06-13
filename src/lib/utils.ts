/**
 * Shared utility functions for formatting, dates, and ID generation.
 * Used across both server actions and client components.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Merge Tailwind classes with conflict resolution (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Currency Formatting ──────────────────────────────────────────────

// Singleton formatter — created once and reused for performance.
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format as "$1,234.56". Negative numbers get Intl's default minus sign. */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

/** Format as "$1,234.56" with explicit sign prefix: "-$1,234.56" or "$1,234.56". */
export function formatCurrencySigned(amount: number): string {
  const formatted = currencyFormatter.format(Math.abs(amount))
  return amount < 0 ? `-${formatted}` : formatted
}

// ── Date Helpers ─────────────────────────────────────────────────────

/** Convert date-only values to local calendar dates without UTC timezone drift. */
function toDisplayDate(date: Date | string): Date {
  if (typeof date === "string") {
    const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      return new Date(Number(year), Number(month) - 1, Number(day))
    }
    return new Date(date)
  }

  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }

  return date
}

/** "Jan 15, 2026" — full date for transaction lists and detail views. */
export function formatDate(date: Date | string): string {
  const d = toDisplayDate(date)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** "Jan 15" — compact date without year, for upcoming bills and recent items. */
export function formatDateShort(date: Date | string): string {
  const d = toDisplayDate(date)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** "January 2026" — for budget period headers and chart axis labels. */
export function formatMonthYear(date: Date | string): string {
  const d = toDisplayDate(date)
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

/** "2026-01" — sortable month key used for budget periods and data bucketing. */
export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** First moment of the month (midnight on the 1st). */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** Last moment of the month (23:59:59.999 on the last day). */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

/**
 * 1-based current payment period for a loan: the number of full monthly periods
 * elapsed since the start date, plus one for the in-progress period.
 *
 * Compares day-of-month, not just year/month — a period only counts once its
 * monthly anniversary has actually been reached. E.g. a loan starting Jan 31,
 * viewed on Feb 1, is still in period 1 (no payment due yet), not period 2.
 * Used to highlight the current amortization row and to estimate interest paid
 * to date for loans imported with no logged payment history.
 *
 * Month-end anniversaries are clamped to the last day of the current month, so
 * a loan due on the 31st counts its anniversary on Feb 28 (or Feb 29 in a leap
 * year), not only in months long enough to contain the 31st.
 *
 * @param startDate - The loan/account start (origination) date
 * @param now - Reference "today" (defaults to the current date)
 * @returns 1-based current payment period (can be <= 0 for a future start date)
 */
export function currentPaymentPeriod(date: Date | string, now: Date = new Date()): number {
  const start = toDisplayDate(date)
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  // Clamp the anniversary day to the current month's last day (day 0 of the next
  // month), so month-end start days register in shorter months.
  const lastDayOfNowMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const anniversaryDay = Math.min(start.getDate(), lastDayOfNowMonth)
  // The monthly anniversary hasn't been reached yet this month.
  if (now.getDate() < anniversaryDay) months -= 1
  return months + 1
}

// ── Transaction Amount Helpers ───────────────────────────────────────

import { INCOME_TYPES, SPENDING_TYPES } from "./constants"

/** Get color class for transaction amount based on its type. */
export function getAmountColor(type: string): string {
  if ((INCOME_TYPES as readonly string[]).includes(type)) return "text-positive"
  if ((SPENDING_TYPES as readonly string[]).includes(type)) return "text-negative"
  return "text-transfer"
}

/** Format amount with sign: income positive, spending negative, transfers show stored sign. */
export function formatAmount(amount: number, type: string): string {
  if ((INCOME_TYPES as readonly string[]).includes(type)) {
    return `+${formatCurrency(Math.abs(amount))}`
  }
  if ((SPENDING_TYPES as readonly string[]).includes(type)) {
    return `-${formatCurrency(Math.abs(amount))}`
  }
  return amount >= 0 ? `+${formatCurrency(amount)}` : `-${formatCurrency(Math.abs(amount))}`
}

// ── ID Generation ────────────────────────────────────────────────────

/** Generate a random UUID (used as fallback ID when Prisma's cuid() isn't available). */
export function generateId(): string {
  return crypto.randomUUID()
}
