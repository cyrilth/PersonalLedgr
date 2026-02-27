"use server"

/**
 * Server actions for the Calendar page.
 *
 * Aggregates all payment obligations (bills, loans, credit cards) and maps
 * them to specific days in a given month, along with their payment status.
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import {
  getPaymentObligations,
  getPaymentRecords,
  type PaymentObligation,
} from "@/actions/payment-tracker"

// ── Types ────────────────────────────────────────────────────────────

export interface CalendarItem {
  obligationId: string
  name: string
  type: "bill" | "loan" | "credit_card"
  amount: number
  day: number // day of month (1-31)
  isPaid: boolean
  paidAmount: number
  isVariableAmount: boolean
  // For PaymentDialog (bills only)
  billId?: string
  accountId: string
  accountName: string
  // For navigation (loans/CCs)
  loanId?: string
}

/**
 * Fetches all obligations for a given month with their due days and payment status.
 */
export async function getCalendarItems(
  month: number, // 1-indexed
  year: number
): Promise<CalendarItem[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")

  const [obligations, paymentRecords, accounts] = await Promise.all([
    getPaymentObligations(),
    getPaymentRecords(month, year, month, year),
    prisma.account.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { id: true, name: true },
    }),
  ])

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))

  const items: CalendarItem[] = []

  for (const ob of obligations) {
    const dueDay = getDueDay(ob, month, year)
    if (dueDay === null) continue

    // Check payment status
    const records = paymentRecords[ob.id] ?? []
    const monthRecords = records.filter(
      (r) => r.month === month && r.year === year
    )
    const isPaid = monthRecords.length > 0
    const paidAmount = monthRecords.reduce((sum, r) => sum + r.amount, 0)

    items.push({
      obligationId: ob.id,
      name: ob.name,
      type: ob.type,
      amount: ob.expectedAmount,
      day: dueDay,
      isPaid,
      paidAmount,
      isVariableAmount: ob.isVariableAmount ?? false,
      billId: ob.billId,
      accountId: ob.accountId,
      accountName: accountMap.get(ob.accountId) ?? "",
      loanId: ob.loanId,
    })
  }

  return items
}

/**
 * Determine the due day for an obligation in a given month.
 * Returns null if the obligation is not due this month.
 */
function getDueDay(
  ob: PaymentObligation,
  month: number,
  year: number
): number | null {
  // QUARTERLY: only due every 3 months from start
  if (ob.frequency === "QUARTERLY") {
    if (ob.startMonth && ob.startYear) {
      const monthsSinceStart =
        (year - ob.startYear) * 12 + (month - ob.startMonth)
      if (monthsSinceStart < 0 || monthsSinceStart % 3 !== 0) return null
    }
    return clampDay(ob.dueDay, month, year)
  }

  // ANNUAL: only due in the start month
  if (ob.frequency === "ANNUAL") {
    if (ob.startMonth && month !== ob.startMonth) return null
    return clampDay(ob.dueDay, month, year)
  }

  // WEEKLY / BIWEEKLY: these have variable dates, show on dueDay as approximation
  // MONTHLY: straightforward
  if (ob.dueDay === null) return null

  // For loans with term, check if the month is within the loan term
  if (ob.type === "loan" && ob.startMonth && ob.startYear && ob.termMonths) {
    const monthsSinceStart =
      (year - ob.startYear) * 12 + (month - ob.startMonth)
    if (monthsSinceStart < 0 || monthsSinceStart > ob.termMonths) return null
  }

  return clampDay(ob.dueDay, month, year)
}

/** Clamp a day-of-month to the actual days in the given month (e.g., 31 -> 28 for Feb). */
function clampDay(
  day: number | null,
  month: number,
  year: number
): number | null {
  if (day === null) return null
  const daysInMonth = new Date(year, month, 0).getDate() // month is 1-indexed, so (year, month, 0) gives last day
  return Math.min(day, daysInMonth)
}
