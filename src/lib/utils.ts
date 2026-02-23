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

/** "Jan 15, 2026" — full date for transaction lists and detail views. */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** "Jan 15" — compact date without year, for upcoming bills and recent items. */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** "January 2026" — for budget period headers and chart axis labels. */
export function formatMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
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
