"use client"

/**
 * Full amortization schedule table for loan detail pages.
 *
 * Generates a month-by-month breakdown of payment, principal, interest,
 * remaining balance, and running totals for cumulative principal and
 * interest paid. The current month row is highlighted based on elapsed
 * time since the loan start date. A summary row at the bottom shows
 * lifetime totals.
 *
 * Uses generateAmortizationSchedule from @/lib/calculations for the
 * underlying math.
 */

import { useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { generateAmortizationSchedule } from "@/lib/calculations"

// ── Props ──────────────────────────────────────────────────────────────

interface AmortizationTableProps {
  balance: number
  apr: number
  monthlyPayment: number
  termMonths: number
  startDate: Date
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Calculate the number of full months elapsed between startDate and now.
 * Returns 1-based month number representing the current payment period.
 */
function getElapsedMonths(startDate: Date): number {
  const now = new Date()
  const start = new Date(startDate)
  const yearDiff = now.getFullYear() - start.getFullYear()
  const monthDiff = now.getMonth() - start.getMonth()
  return yearDiff * 12 + monthDiff + 1
}

/**
 * Format a month number as a readable date label relative to startDate.
 * e.g., month 1 from Jan 2025 start -> "Feb 2025" (first payment month).
 */
function formatMonthLabel(month: number, startDate: Date): string {
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + month)
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Renders a scrollable amortization schedule table with highlighted
 * current month and running totals for principal and interest paid.
 */
export function AmortizationTable({
  balance,
  apr,
  monthlyPayment,
  termMonths,
  startDate,
}: AmortizationTableProps) {
  const schedule = useMemo(
    () => generateAmortizationSchedule(balance, apr, monthlyPayment, termMonths),
    [balance, apr, monthlyPayment, termMonths]
  )

  const currentMonth = useMemo(() => getElapsedMonths(startDate), [startDate])

  // ── Running totals ─────────────────────────────────────────────────

  const rows = useMemo(() => {
    let cumulativePrincipal = 0
    let cumulativeInterest = 0

    return schedule.map((row) => {
      cumulativePrincipal += row.principal
      cumulativeInterest += row.interest

      return {
        ...row,
        cumulativePrincipal: Math.round(cumulativePrincipal * 100) / 100,
        cumulativeInterest: Math.round(cumulativeInterest * 100) / 100,
      }
    })
  }, [schedule])

  // ── Totals ─────────────────────────────────────────────────────────

  const totalPayment = rows.reduce((sum, r) => sum + r.payment, 0)
  const totalPrincipal = rows.reduce((sum, r) => sum + r.principal, 0)
  const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No amortization data available. The loan may already be paid off.
      </p>
    )
  }

  return (
    <ScrollArea className="max-h-[600px] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Month</TableHead>
            <TableHead className="w-24">Date</TableHead>
            <TableHead className="text-right">Payment</TableHead>
            <TableHead className="text-right">Principal</TableHead>
            <TableHead className="text-right">Interest</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Cum. Principal</TableHead>
            <TableHead className="text-right">Cum. Interest</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isCurrent = row.month === currentMonth

            return (
              <TableRow
                key={row.month}
                className={cn(
                  isCurrent &&
                    "bg-emerald-50 dark:bg-emerald-950/40 font-medium"
                )}
              >
                <TableCell className="tabular-nums">{row.month}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatMonthLabel(row.month, startDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.payment)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.principal)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.interest)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.remainingBalance)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(row.cumulativePrincipal)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(row.cumulativeInterest)}
                </TableCell>
              </TableRow>
            )
          })}

          {/* Summary row */}
          <TableRow className="border-t-2 font-semibold bg-muted/50">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(Math.round(totalPayment * 100) / 100)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(Math.round(totalPrincipal * 100) / 100)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(Math.round(totalInterest * 100) / 100)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(Math.round(totalPrincipal * 100) / 100)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(Math.round(totalInterest * 100) / 100)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
