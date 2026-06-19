"use client"

/**
 * Full amortization schedule table for loan detail pages.
 *
 * Generates a month-by-month breakdown of payment, principal, interest,
 * remaining balance, and running totals for cumulative principal and
 * interest paid — starting from the loan's ORIGINAL balance at its start
 * date, so the schedule reflects the full life of the loan (past payments
 * already made plus future ones). The current month row is highlighted
 * based on elapsed time since the loan start date. A summary row at the
 * bottom shows lifetime totals.
 *
 * The schedule is paginated (one year of payments per page) and defaults to
 * the page containing the current payment period.
 *
 * Uses generateAmortizationSchedule from @/lib/calculations for the
 * underlying math.
 */

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatCurrency, currentPaymentPeriod } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { generateAmortizationSchedule } from "@/lib/calculations"
import type { AmortizationRow } from "@/lib/calculations"

// ── Constants ────────────────────────────────────────────────────────────

/** Rows shown per page — 12 = one year of payments per page. */
const PAGE_SIZE = 12

// ── Types ──────────────────────────────────────────────────────────────

/** A schedule row plus its running cumulative principal/interest totals. */
type CumulativeRow = AmortizationRow & {
  cumulativePrincipal: number
  cumulativeInterest: number
}

// ── Props ──────────────────────────────────────────────────────────────

interface AmortizationTableProps {
  /**
   * The loan's original (origination) balance. The schedule is built from
   * this value over the full term so it reflects the entire loan life, not
   * just the remaining payoff from today.
   */
  originalBalance: number
  apr: number
  monthlyPayment: number
  termMonths: number
  startDate: Date
  /** Phase 1: months of no-payment deferment before repayment (optional). */
  defermentMonths?: number
  /** Phase 2: months of interest-only payments before repayment (optional). */
  interestOnlyMonths?: number
  /** Subsidized loans don't accrue interest during deferment (optional). */
  subsidized?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────

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
 * Renders a paginated amortization schedule table with highlighted
 * current month and running totals for principal and interest paid.
 */
export function AmortizationTable({
  originalBalance,
  apr,
  monthlyPayment,
  termMonths,
  startDate,
  defermentMonths = 0,
  interestOnlyMonths = 0,
  subsidized = false,
}: AmortizationTableProps) {
  const schedule = useMemo(
    () =>
      generateAmortizationSchedule(originalBalance, apr, monthlyPayment, termMonths, {
        defermentMonths,
        interestOnlyMonths,
        subsidized,
      }),
    [originalBalance, apr, monthlyPayment, termMonths, defermentMonths, interestOnlyMonths, subsidized]
  )

  const currentMonth = useMemo(() => currentPaymentPeriod(startDate), [startDate])

  // ── Running totals (computed across the FULL schedule) ──────────────

  const rows = useMemo<CumulativeRow[]>(
    () =>
      schedule.reduce<CumulativeRow[]>((acc, row) => {
        const prev = acc[acc.length - 1]
        return [
          ...acc,
          {
            ...row,
            cumulativePrincipal:
              Math.round(((prev?.cumulativePrincipal ?? 0) + row.principal) * 100) / 100,
            cumulativeInterest:
              Math.round(((prev?.cumulativeInterest ?? 0) + row.interest) * 100) / 100,
          },
        ]
      }, []),
    [schedule]
  )

  // ── Totals ─────────────────────────────────────────────────────────

  const totalPayment = rows.reduce((sum, r) => sum + r.payment, 0)
  const totalPrincipal = rows.reduce((sum, r) => sum + r.principal, 0)
  const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0)

  // ── Pagination ─────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))

  // Default to the page containing the current payment period so the user
  // lands on "now" rather than the start of the loan.
  const initialPage = useMemo(() => {
    const p = Math.ceil(currentMonth / PAGE_SIZE)
    return Math.min(Math.max(p, 1), totalPages)
  }, [currentMonth, totalPages])

  const [page, setPage] = useState(initialPage)

  // Clamp page if the schedule shrinks (e.g., inputs change).
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No amortization data available. The loan may already be paid off.
      </p>
    )
  }

  const isLastPage = safePage >= totalPages

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
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
            {pageRows.map((row) => {
              const isCurrent = row.month === currentMonth
              const isPaid = row.month < currentMonth

              return (
                <TableRow
                  key={row.month}
                  className={cn(
                    isCurrent && "bg-emerald-50 dark:bg-emerald-950/40 font-medium",
                    isPaid && !isCurrent && "text-muted-foreground"
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

            {/* Summary row — only on the last page so lifetime totals sit at the end */}
            {isLastPage && (
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
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={safePage <= 1}
          onClick={() => setPage(safePage - 1)}
          className="h-8 gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-muted-foreground text-xs tabular-nums">
          Page {safePage} of {totalPages}
          <span className="hidden sm:inline">
            {" · "}
            {formatMonthLabel(pageRows[0].month, startDate)}
            {pageRows.length > 1 &&
              ` – ${formatMonthLabel(pageRows[pageRows.length - 1].month, startDate)}`}
          </span>
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={isLastPage}
          onClick={() => setPage(safePage + 1)}
          className="h-8 gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
