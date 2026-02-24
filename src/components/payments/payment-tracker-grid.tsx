"use client"

/**
 * Payment Tracker Grid — unified Jan–Dec ledger for bills, loans, and credit cards.
 *
 * Generalizes the payment-ledger.tsx pattern to support all three obligation types.
 * Each section (Bills, Loans, Credit Cards) renders its obligations as rows with
 * 12 monthly cells showing payment status.
 */

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  Minus,
  Trash2,
  Receipt,
  HandCoins,
  CreditCard,
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
import {
  getPaymentRecords,
  type PaymentObligation,
  type PaymentRecord,
} from "@/actions/payment-tracker"
import { deleteBillPayment } from "@/actions/bill-payments"
import { PaymentDialog } from "@/components/recurring/payment-dialog"
import { formatCurrency, cn } from "@/lib/utils"

// ── Constants ────────────────────────────────────────────────────────

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

// ── Helpers ──────────────────────────────────────────────────────────

interface MonthYear {
  month: number // 1-12
  year: number
}

function getMonthRange(year: number): MonthYear[] {
  return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year }))
}

/** Check if an obligation is due in a specific month. */
function isObligationDueInMonth(
  ob: PaymentObligation,
  month: number,
  year: number
): boolean {
  if (ob.type === "bill") {
    if (ob.frequency === "MONTHLY") return true

    // For quarterly/annual bills, we need to check alignment.
    // We don't have nextDueDate here, but we have dueDay.
    // Use a simpler heuristic based on the bill's frequency.
    // Since bills always have an ID that maps back, the actual frequency
    // alignment is passed through from the bill data.
    if (ob.frequency === "QUARTERLY") {
      // We'll mark all months as potentially due and let the payment data show actual status
      // This is a simplification — ideally we'd pass the nextDueDate pattern
      return true
    }
    if (ob.frequency === "ANNUAL") {
      return true
    }
    return true
  }

  if (ob.type === "loan") {
    // Loan is due every month from startDate to startDate + termMonths
    if (ob.startMonth === undefined || ob.startYear === undefined || ob.termMonths === undefined) {
      return true
    }

    const startMonthIndex = (ob.startYear * 12) + (ob.startMonth - 1)
    const currentMonthIndex = (year * 12) + (month - 1)
    const endMonthIndex = startMonthIndex + ob.termMonths

    return currentMonthIndex >= startMonthIndex && currentMonthIndex < endMonthIndex
  }

  // Credit cards: always due monthly
  return true
}

type CellState = "paid" | "overdue" | "current" | "future" | "na"

function getCellState(
  ob: PaymentObligation,
  monthYear: MonthYear,
  payments: PaymentRecord[],
  now: Date
): CellState {
  if (!isObligationDueInMonth(ob, monthYear.month, monthYear.year)) {
    return "na"
  }

  const isPaid = payments.some(
    (p) => p.month === monthYear.month && p.year === monthYear.year
  )
  if (isPaid) return "paid"

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
    case "paid": return "Paid"
    case "overdue": return "Overdue"
    case "current": return "Due this month"
    case "future": return "Upcoming"
    case "na": return "Not due"
  }
}

// ── Skeleton ─────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8" />
        <div className="flex gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16" />
          ))}
        </div>
        <Skeleton className="h-8 w-8" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-8 w-32" />
          <div className="flex flex-1 gap-2">
            {Array.from({ length: 12 }).map((_, j) => (
              <Skeleton key={j} className="h-8 flex-1" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Section Header ───────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────

interface PaymentTrackerGridProps {
  obligations: PaymentObligation[]
  accounts: { id: string; name: string }[]
}

export function PaymentTrackerGrid({ obligations, accounts }: PaymentTrackerGridProps) {
  const router = useRouter()
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [payments, setPayments] = useState<Record<string, PaymentRecord[]>>({})
  const [loading, setLoading] = useState(true)

  // Bill payment dialog state
  const [paymentDialog, setPaymentDialog] = useState<{
    obligation: PaymentObligation
    month: number
    year: number
  } | null>(null)

  // Delete payment confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    paymentId: string
    name: string
    monthLabel: string
  } | null>(null)

  const months = getMonthRange(currentYear)
  const now = new Date()

  const billObligations = obligations.filter((o) => o.type === "bill")
  const loanObligations = obligations.filter((o) => o.type === "loan")
  const ccObligations = obligations.filter((o) => o.type === "credit_card")

  const fetchPayments = useCallback(async () => {
    if (obligations.length === 0) {
      setPayments({})
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await getPaymentRecords(1, currentYear, 12, currentYear)
      setPayments(data)
    } catch (err) {
      console.error("Failed to load payment data:", err)
      toast.error("Failed to load payment data")
    } finally {
      setLoading(false)
    }
  }, [obligations.length, currentYear])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  function navigateYear(direction: number) {
    setCurrentYear((prev) => prev + direction)
  }

  function handleCellClick(
    ob: PaymentObligation,
    monthYear: MonthYear,
    state: CellState
  ) {
    if (state === "na") return

    if (state === "paid") {
      // Only bills support delete from the grid
      if (ob.type === "bill") {
        const obPayments = payments[ob.id] || []
        const payment = obPayments.find(
          (p) => p.month === monthYear.month && p.year === monthYear.year
        )
        if (payment) {
          setDeleteTarget({
            paymentId: payment.id,
            name: ob.name,
            monthLabel: `${MONTH_ABBR[monthYear.month - 1]} ${monthYear.year}`,
          })
        }
      }
      return
    }

    // Unpaid cell clicks
    if (ob.type === "bill") {
      setPaymentDialog({ obligation: ob, month: monthYear.month, year: monthYear.year })
    } else if (ob.type === "loan") {
      router.push(`/loans/${ob.loanId}`)
    } else if (ob.type === "credit_card") {
      const accountId = ob.accountId
      router.push(`/accounts/${accountId}`)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await deleteBillPayment(deleteTarget.paymentId)
      toast.success("Payment record removed")
      setDeleteTarget(null)
      fetchPayments()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove payment"
      toast.error(message)
    }
  }

  if (obligations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground">
          No payment obligations to track. Add recurring bills, loans, or credit cards to get started.
        </p>
      </div>
    )
  }

  function renderObligationRow(ob: PaymentObligation) {
    const obPayments = payments[ob.id] || []

    return (
      <div key={ob.id} className="flex items-center gap-2 py-1">
        <div className="w-40 shrink-0 truncate text-sm font-medium" title={ob.name}>
          {ob.name}
        </div>
        <div className="flex flex-1 gap-1">
          {months.map((my) => {
            const state = getCellState(ob, my, obPayments, now)
            const payment = state === "paid"
              ? obPayments.find((p) => p.month === my.month && p.year === my.year)
              : null

            return (
              <Tooltip key={`${my.year}-${my.month}`}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "flex-1 flex items-center justify-center h-9 rounded border text-sm transition-colors",
                      cellStyles(state),
                      state !== "na" && "cursor-pointer hover:opacity-80",
                      state === "na" && "cursor-default"
                    )}
                    onClick={() => handleCellClick(ob, my, state)}
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
                  <p className="font-medium">{ob.name}</p>
                  <p className="text-xs">
                    {MONTH_ABBR[my.month - 1]} {my.year} — {cellLabel(state)}
                  </p>
                  {payment && (
                    <p className="text-xs">{formatCurrency(payment.amount)} paid</p>
                  )}
                  {state !== "na" && state !== "paid" && ob.type === "bill" && (
                    <p className="text-xs text-muted-foreground">Click to record or link payment</p>
                  )}
                  {state !== "na" && state !== "paid" && ob.type === "loan" && (
                    <p className="text-xs text-muted-foreground">Click to go to loan</p>
                  )}
                  {state !== "na" && state !== "paid" && ob.type === "credit_card" && (
                    <p className="text-xs text-muted-foreground">Click to go to account</p>
                  )}
                  {state === "paid" && ob.type === "bill" && (
                    <p className="text-xs text-muted-foreground">Click to remove payment</p>
                  )}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
    )
  }

  // Find the bill data for the payment dialog
  const dialogBill = paymentDialog?.obligation
  const dialogBillAccount = dialogBill
    ? accounts.find((a) => a.id === dialogBill.accountId)
    : null

  return (
    <TooltipProvider>
      <Card>
        <CardContent className="py-4">
          {loading ? (
            <GridSkeleton />
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
                    onClick={() => setCurrentYear(new Date().getFullYear())}
                  >
                    {currentYear}
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

              {/* Bills section */}
              <SectionHeader icon={Receipt} label="Bills" count={billObligations.length} />
              {billObligations.map(renderObligationRow)}

              {/* Loans section */}
              <SectionHeader icon={HandCoins} label="Loans" count={loanObligations.length} />
              {loanObligations.map(renderObligationRow)}

              {/* Credit Cards section */}
              <SectionHeader icon={CreditCard} label="Credit Cards" count={ccObligations.length} />
              {ccObligations.map(renderObligationRow)}

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

      {/* Record payment dialog (bills only) */}
      <PaymentDialog
        open={!!paymentDialog}
        onOpenChange={(open) => {
          if (!open) setPaymentDialog(null)
        }}
        onSuccess={fetchPayments}
        bill={
          paymentDialog && dialogBill
            ? {
                id: dialogBill.billId!,
                name: dialogBill.name,
                amount: dialogBill.expectedAmount,
                isVariableAmount: dialogBill.isVariableAmount ?? false,
                accountId: dialogBill.accountId,
                accountName: dialogBillAccount?.name ?? "",
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
              Remove the payment record for &quot;{deleteTarget?.name}&quot;
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
