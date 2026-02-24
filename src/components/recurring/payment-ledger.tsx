"use client"

/**
 * Payment Ledger — multi-month grid showing bill payment status.
 *
 * Displays 6 columns (3 trailing + current + 2 future months) with
 * navigation arrows. Each cell shows the payment status for a bill
 * in that month: paid (green), overdue (red), current unpaid (amber),
 * future (gray), or N/A (not due that month).
 */

import { useEffect, useState, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  Minus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getBillPayments, deleteBillPayment } from "@/actions/bill-payments"
import type { BillPaymentRecord } from "@/actions/bill-payments"
import type { RecurringBillSummary } from "@/actions/recurring"
import { PaymentDialog } from "./payment-dialog"
import { formatCurrency, cn } from "@/lib/utils"

// ── Constants ────────────────────────────────────────────────────────

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const COLS = 12 // Full year: Jan–Dec

// ── Helpers ──────────────────────────────────────────────────────────

interface MonthYear {
  month: number // 1-12
  year: number
}

/** Generate 12 months (Jan–Dec) for the given year. */
function getMonthRange(centerDate: Date): MonthYear[] {
  const year = centerDate.getFullYear()
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    year,
  }))
}

/** Check if a bill is due in a specific month based on its frequency and start pattern. */
function isBillDueInMonth(
  bill: RecurringBillSummary,
  month: number,
  year: number
): boolean {
  if (bill.frequency === "MONTHLY") return true

  // For quarterly/annual, check if this month aligns with the bill's pattern.
  // Use nextDueDate to determine the recurrence pattern.
  const nextDue = new Date(bill.nextDueDate)
  const nextDueMonth = nextDue.getMonth() + 1 // 1-12

  if (bill.frequency === "QUARTERLY") {
    // Bill is due every 3 months from its base month
    const diff = ((month - nextDueMonth) % 3 + 3) % 3
    return diff === 0
  }

  if (bill.frequency === "ANNUAL") {
    return month === nextDueMonth
  }

  return true
}

/** Determine the cell state for a bill in a given month. */
type CellState = "paid" | "overdue" | "current" | "future" | "na"

function getCellState(
  bill: RecurringBillSummary,
  monthYear: MonthYear,
  payments: BillPaymentRecord[],
  now: Date
): CellState {
  // Check if bill is due this month
  if (!isBillDueInMonth(bill, monthYear.month, monthYear.year)) {
    return "na"
  }

  // Check if paid
  const isPaid = payments.some(
    (p) => p.month === monthYear.month && p.year === monthYear.year
  )
  if (isPaid) return "paid"

  // Determine temporal position
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  if (
    monthYear.year < currentYear ||
    (monthYear.year === currentYear && monthYear.month < currentMonth)
  ) {
    return "overdue"
  }

  if (monthYear.year === currentYear && monthYear.month === currentMonth) {
    return "current"
  }

  return "future"
}

// ── Components ───────────────────────────────────────────────────────

function LedgerSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8" />
        <div className="flex gap-2">
          {Array.from({ length: COLS }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16" />
          ))}
        </div>
        <Skeleton className="h-8 w-8" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-8 w-32" />
          <div className="flex flex-1 gap-2">
            {Array.from({ length: COLS }).map((_, j) => (
              <Skeleton key={j} className="h-8 flex-1" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CellIcon({ state }: { state: CellState }) {
  switch (state) {
    case "paid":
      return <Check className="h-4 w-4" />
    case "overdue":
      return <X className="h-4 w-4" />
    case "current":
      return <Clock className="h-4 w-4" />
    case "future":
      return <Minus className="h-4 w-4" />
    case "na":
      return null
  }
}

function cellStyles(state: CellState): string {
  switch (state) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
    case "overdue":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
    case "current":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
    case "future":
      return "bg-muted/50 text-muted-foreground border-transparent"
    case "na":
      return "bg-transparent text-muted-foreground/30 border-transparent"
  }
}

function cellLabel(state: CellState): string {
  switch (state) {
    case "paid":
      return "Paid"
    case "overdue":
      return "Overdue"
    case "current":
      return "Due this month"
    case "future":
      return "Upcoming"
    case "na":
      return "Not due"
  }
}

// ── Main Component ───────────────────────────────────────────────────

interface PaymentLedgerProps {
  bills: RecurringBillSummary[]
  accounts: { id: string; name: string }[]
}

export function PaymentLedger({ bills, accounts }: PaymentLedgerProps) {
  const [centerDate, setCenterDate] = useState(() => new Date())
  const [payments, setPayments] = useState<
    Record<string, BillPaymentRecord[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [paymentDialog, setPaymentDialog] = useState<{
    bill: RecurringBillSummary
    month: number
    year: number
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    paymentId: string
    billName: string
    monthLabel: string
  } | null>(null)

  const months = getMonthRange(centerDate)
  const now = new Date()

  const fetchPayments = useCallback(async () => {
    if (bills.length === 0) {
      setPayments({})
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const first = months[0]
      const last = months[months.length - 1]
      const data = await getBillPayments(
        first.month,
        first.year,
        last.month,
        last.year
      )
      setPayments(data)
    } catch (err) {
      console.error("Failed to load payment data:", err)
      toast.error("Failed to load payment data")
    } finally {
      setLoading(false)
    }
  }, [bills.length, centerDate])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  function navigateYear(direction: number) {
    setCenterDate((prev) => {
      const d = new Date(prev)
      d.setFullYear(d.getFullYear() + direction)
      return d
    })
  }

  function handleCellClick(
    bill: RecurringBillSummary,
    monthYear: MonthYear,
    state: CellState
  ) {
    if (state === "na") return

    if (state === "paid") {
      // Find the payment to allow deletion
      const billPayments = payments[bill.id] || []
      const payment = billPayments.find(
        (p) => p.month === monthYear.month && p.year === monthYear.year
      )
      if (payment) {
        setDeleteTarget({
          paymentId: payment.id,
          billName: bill.name,
          monthLabel: `${MONTH_ABBR[monthYear.month - 1]} ${monthYear.year}`,
        })
      }
      return
    }

    // Open payment dialog for unpaid cells
    setPaymentDialog({
      bill,
      month: monthYear.month,
      year: monthYear.year,
    })
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await deleteBillPayment(deleteTarget.paymentId)
      toast.success("Payment record removed")
      setDeleteTarget(null)
      fetchPayments()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove payment"
      toast.error(message)
    }
  }

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground">
          No recurring bills to display in the payment ledger.
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <Card>
        <CardContent className="py-4">
          {loading ? (
            <LedgerSkeleton />
          ) : (
            <div className="space-y-1">
              {/* Header row: navigation + month labels */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-40 shrink-0 flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigateYear(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 font-semibold"
                    onClick={() => setCenterDate(new Date())}
                  >
                    {centerDate.getFullYear()}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigateYear(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-1 gap-1">
                  {months.map((my) => {
                    const isCurrentMonth =
                      my.month === now.getMonth() + 1 &&
                      my.year === now.getFullYear()
                    return (
                      <div
                        key={`${my.year}-${my.month}`}
                        className={cn(
                          "flex-1 text-center text-xs font-medium py-1 rounded",
                          isCurrentMonth
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {MONTH_ABBR[my.month - 1]}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bill rows */}
              {bills.map((bill) => {
                const billPayments = payments[bill.id] || []

                return (
                  <div
                    key={bill.id}
                    className="flex items-center gap-2 py-1"
                  >
                    {/* Bill name */}
                    <div className="w-40 shrink-0 truncate text-sm font-medium">
                      {bill.name}
                    </div>

                    {/* Month cells */}
                    <div className="flex flex-1 gap-1">
                      {months.map((my) => {
                        const state = getCellState(
                          bill,
                          my,
                          billPayments,
                          now
                        )
                        const payment =
                          state === "paid"
                            ? billPayments.find(
                                (p) =>
                                  p.month === my.month && p.year === my.year
                              )
                            : null

                        return (
                          <Tooltip key={`${my.year}-${my.month}`}>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  "flex-1 flex items-center justify-center h-9 rounded border text-sm transition-colors",
                                  cellStyles(state),
                                  state !== "na" &&
                                    "cursor-pointer hover:opacity-80",
                                  state === "na" && "cursor-default"
                                )}
                                onClick={() =>
                                  handleCellClick(bill, my, state)
                                }
                                disabled={state === "na"}
                              >
                                {state === "paid" && payment ? (
                                  <span className="text-[11px] font-medium leading-tight">
                                    {formatCurrency(payment.amount)}
                                  </span>
                                ) : (
                                  <CellIcon state={state} />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{bill.name}</p>
                              <p className="text-xs">
                                {MONTH_ABBR[my.month - 1]} {my.year} —{" "}
                                {cellLabel(state)}
                              </p>
                              {payment && (
                                <p className="text-xs">
                                  {formatCurrency(payment.amount)} paid
                                </p>
                              )}
                              {(state === "current" ||
                                state === "overdue" ||
                                state === "future") && (
                                <p className="text-xs text-muted-foreground">
                                  Click to record payment
                                </p>
                              )}
                              {state === "paid" && (
                                <p className="text-xs text-muted-foreground">
                                  Click to remove payment
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Legend */}
              <div className="flex flex-wrap gap-4 pt-4 mt-2 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-emerald-500/15 border border-emerald-500/30" />
                  Paid
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-red-500/15 border border-red-500/30" />
                  Overdue
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-amber-500/15 border border-amber-500/30" />
                  Due this month
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-muted/50" />
                  Upcoming
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded border border-dashed" />
                  Not due
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record payment dialog */}
      <PaymentDialog
        open={!!paymentDialog}
        onOpenChange={(open) => {
          if (!open) setPaymentDialog(null)
        }}
        onSuccess={fetchPayments}
        bill={
          paymentDialog
            ? {
                id: paymentDialog.bill.id,
                name: paymentDialog.bill.name,
                amount: paymentDialog.bill.amount,
                isVariableAmount: paymentDialog.bill.isVariableAmount,
                accountId: paymentDialog.bill.account.id,
                accountName: paymentDialog.bill.account.name,
              }
            : null
        }
        month={paymentDialog?.month ?? 1}
        year={paymentDialog?.year ?? 2026}
        accounts={accounts}
      />

      {/* Delete payment confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Payment Record</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the payment record for &quot;{deleteTarget?.billName}&quot;
              ({deleteTarget?.monthLabel})? If the transaction was auto-created
              by the ledger, it will be deleted and the balance reversed.
              Imported or manual transactions will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
