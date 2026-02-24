"use client"

/**
 * Loan detail page — shows full information for a single loan account.
 *
 * Sections:
 * 1. Header with key stats grid, edit/delete actions
 * 2. Interest summary with paid-vs-remaining donut chart (Recharts)
 * 3. Payment history table (recent transactions for this loan)
 * 4. Amortization table (full month-by-month schedule)
 * 5. Extra payment calculator (interactive "what if" tool)
 *
 * Layout uses a responsive two-column grid on desktop:
 *   Left column:  Interest chart + Amortization table
 *   Right column: Extra payment calc + Payment history
 * On mobile everything stacks vertically.
 */

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Pencil, Trash2, ShoppingBag } from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

import { getLoan, calculateTotalInterestPaid, deleteLoan } from "@/actions/loans"
import { calculateTotalInterestRemaining, calculatePaydayFee, calculatePaydayAPR } from "@/lib/calculations"
import { LoanForm } from "@/components/loans/loan-form"
import { AmortizationTable } from "@/components/loans/amortization-table"
import { ExtraPaymentCalc } from "@/components/loans/extra-payment-calc"
import {
  formatCurrency,
  formatDate,
  formatAmount,
  getAmountColor,
} from "@/lib/utils"
import { cn } from "@/lib/utils"
import { LOAN_TYPE_LABELS } from "@/lib/constants"
import type { LoanType } from "@/lib/constants"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

// ── Types ────────────────────────────────────────────────────────────

type LoanDetail = Awaited<ReturnType<typeof getLoan>>

// ── Skeleton ─────────────────────────────────────────────────────────

/** Loading placeholder shown while loan data is being fetched. */
function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Format loan term as "X months (Y years)" when evenly divisible by 12, otherwise just "X months". */
function formatTerm(months: number): string {
  if (months % 12 === 0) {
    return `${months} months (${months / 12} years)`
  }
  return `${months} months`
}

/** Custom tooltip for the interest donut chart. */
function InterestChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number }>
}) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{formatCurrency(value)}</p>
    </div>
  )
}

// ── Colors ───────────────────────────────────────────────────────────

const CHART_COLORS = {
  paid: "#10b981",     // emerald-500
  remaining: "#a1a1aa", // zinc-400 (muted)
}

// ── Page Component ───────────────────────────────────────────────────

export default function LoanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // ── State ────────────────────────────────────────────────────────

  const [loan, setLoan] = useState<LoanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [interestPaid, setInterestPaid] = useState(0)
  const [interestRemaining, setInterestRemaining] = useState(0)

  // ── Data Fetching ────────────────────────────────────────────────

  /** Fetch all loan data: detail, interest paid, and interest remaining. */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [loanData, paid] = await Promise.all([
        getLoan(id),
        calculateTotalInterestPaid(id),
      ])
      setLoan(loanData)
      setInterestPaid(paid)

      // Calculate remaining interest from current balance and schedule
      const remaining = calculateTotalInterestRemaining(
        loanData.balance,
        loanData.interestRate,
        loanData.monthlyPayment
      )
      setInterestRemaining(remaining)
    } catch (err) {
      console.error("Failed to load loan:", err)
      toast.error("Failed to load loan")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Delete Handler ───────────────────────────────────────────────

  /** Soft-delete the loan and navigate back to the loans list. */
  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteLoan(id)
      toast.success("Loan deleted")
      router.push("/loans")
    } catch (err) {
      toast.error("Failed to delete loan")
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading / Not Found States ───────────────────────────────────

  if (loading) return <DetailSkeleton />

  if (!loan) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">Loan not found.</p>
        <Link href="/loans">
          <Button variant="outline">Back to Loans</Button>
        </Link>
      </div>
    )
  }

  // ── Derived Values ───────────────────────────────────────────────

  const displayBalance = Math.abs(loan.balance)
  const totalInterest = interestPaid + interestRemaining
  const isBNPL = loan.loanType === "BNPL"
  const isPayday = loan.loanType === "PAYDAY"

  // Payday derived values
  const paydayFee = isPayday && loan.feePerHundred
    ? calculatePaydayFee(loan.originalBalance, loan.feePerHundred)
    : 0
  const paydayAPR = isPayday && loan.feePerHundred && loan.termDays
    ? calculatePaydayAPR(loan.feePerHundred, loan.termDays)
    : 0
  const paydayDaysRemaining = isPayday && loan.dueDate
    ? Math.ceil((new Date(loan.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0

  const pieData = [
    { name: "Interest Paid", value: interestPaid },
    { name: "Interest Remaining", value: interestRemaining },
  ]

  return (
    <div className="space-y-6">
      {/* ── Back Button + Title ──────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/loans">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {loan.accountName}
              </h1>
              <Badge variant="secondary">
                {LOAN_TYPE_LABELS[loan.loanType as LoanType] ?? loan.loanType}
              </Badge>
            </div>
            {loan.owner && (
              <p className="text-sm text-muted-foreground">{loan.owner}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* ── Header Stats Card ────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          {isPayday ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Total Owed</dt>
                <dd className="mt-1 text-2xl font-bold text-negative">
                  {formatCurrency(displayBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Amount Borrowed</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrency(loan.originalBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fee</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrency(paydayFee)}
                  <span className="text-xs text-muted-foreground ml-1">
                    (${loan.feePerHundred}/100)
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Due Date</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {loan.dueDate ? formatDate(loan.dueDate) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Days Remaining</dt>
                <dd className={cn(
                  "mt-1 text-lg font-semibold",
                  paydayDaysRemaining < 0 ? "text-destructive" : paydayDaysRemaining <= 3 ? "text-amber-500" : ""
                )}>
                  {paydayDaysRemaining < 0 ? "OVERDUE" : `${paydayDaysRemaining} days`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Equivalent APR</dt>
                <dd className="mt-1 text-lg font-semibold text-destructive">
                  {paydayAPR.toFixed(1)}%
                </dd>
              </div>
              {loan.lenderName && (
                <div>
                  <dt className="text-muted-foreground">Lender</dt>
                  <dd className="mt-1 text-lg font-semibold">{loan.lenderName}</dd>
                </div>
              )}
              {loan.paymentAccountName && (
                <div>
                  <dt className="text-muted-foreground">Payment Account</dt>
                  <dd className="mt-1 text-lg font-semibold">{loan.paymentAccountName}</dd>
                </div>
              )}
            </dl>
          ) : isBNPL ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Remaining Balance</dt>
                <dd className="mt-1 text-2xl font-bold text-negative">
                  {formatCurrency(displayBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Purchase Price</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrency(loan.originalBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Installment Amount</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrency(loan.monthlyPayment)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Progress</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {loan.completedInstallments} of {loan.totalInstallments} paid
                </dd>
              </div>
              {loan.nextPaymentDate && (
                <div>
                  <dt className="text-muted-foreground">Next Payment</dt>
                  <dd className="mt-1 text-lg font-semibold">
                    {formatDate(loan.nextPaymentDate)}
                  </dd>
                </div>
              )}
              {loan.merchantName && (
                <div>
                  <dt className="text-muted-foreground">Merchant</dt>
                  <dd className="mt-1 text-lg font-semibold">{loan.merchantName}</dd>
                </div>
              )}
              {loan.interestRate > 0 && (
                <div>
                  <dt className="text-muted-foreground">Interest Rate</dt>
                  <dd className="mt-1 text-lg font-semibold">{loan.interestRate}%</dd>
                </div>
              )}
              {loan.paymentAccountName && (
                <div>
                  <dt className="text-muted-foreground">Payment Account</dt>
                  <dd className="mt-1 text-lg font-semibold">{loan.paymentAccountName}</dd>
                </div>
              )}
            </dl>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Current Balance</dt>
                <dd className="mt-1 text-2xl font-bold text-negative">
                  {formatCurrency(displayBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Original Balance</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrency(loan.originalBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Interest Rate (APR)</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {loan.interestRate}%
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monthly Payment</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrency(loan.monthlyPayment)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Term</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatTerm(loan.termMonths)}
                </dd>
              </div>
              {loan.owner && (
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="mt-1 text-lg font-semibold">{loan.owner}</dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* ── BNPL Installment Timeline ──────────────────────────── */}
      {isBNPL && loan.totalInstallments && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-4">
              Installment Timeline
            </p>
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: loan.totalInstallments }, (_, i) => {
                const isCompleted = i < loan.completedInstallments
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border-2",
                        isCompleted
                          ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted/50 border-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      {i + 1}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {isCompleted ? "Paid" : i === loan.completedInstallments ? "Next" : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Two-Column Grid ──────────────────────────────────────── */}
      <div className={cn("grid gap-6", !isBNPL && !isPayday && "lg:grid-cols-2")}>
        {/* Left Column: Interest Chart + Amortization Table (hidden for BNPL and Payday) */}
        {!isBNPL && !isPayday && (
        <div className="space-y-6">
          {/* ── Interest Summary Card ─────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Interest Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Interest Paid to Date
                  </p>
                  <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(interestPaid)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Interest Remaining
                  </p>
                  <p className="mt-1 text-xl font-semibold text-muted-foreground">
                    {formatCurrency(interestRemaining)}
                  </p>
                </div>
              </div>

              {/* Donut Chart */}
              {totalInterest > 0 && (
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        <Cell fill={CHART_COLORS.paid} />
                        <Cell fill={CHART_COLORS.remaining} />
                      </Pie>
                      <Tooltip content={<InterestChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Legend */}
              {totalInterest > 0 && (
                <div className="flex items-center justify-center gap-6 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: CHART_COLORS.paid }}
                    />
                    <span className="text-muted-foreground">
                      Paid ({totalInterest > 0 ? ((interestPaid / totalInterest) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: CHART_COLORS.remaining }}
                    />
                    <span className="text-muted-foreground">
                      Remaining ({totalInterest > 0 ? ((interestRemaining / totalInterest) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Amortization Table ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Amortization Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AmortizationTable
                balance={loan.balance}
                apr={loan.interestRate}
                monthlyPayment={loan.monthlyPayment}
                termMonths={loan.termMonths}
                startDate={loan.startDate}
              />
            </CardContent>
          </Card>
        </div>
        )}

        {/* Right Column: Extra Payment Calc + Payment History */}
        <div className="space-y-6">
          {/* ── Extra Payment Calculator (hidden for BNPL and Payday) ── */}
          {!isBNPL && !isPayday && (
          <ExtraPaymentCalc
            balance={loan.balance}
            apr={loan.interestRate}
            monthlyPayment={loan.monthlyPayment}
            termMonths={loan.termMonths}
          />
          )}

          {/* ── Payment History ───────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loan.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transactions recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loan.transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                            {formatDate(t.date)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm font-medium">
                            {t.description}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right text-sm font-medium whitespace-nowrap",
                              getAmountColor(t.type)
                            )}
                          >
                            {formatAmount(t.amount, t.type)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {t.type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.category ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Edit Loan Dialog ──────────────────────────────────────── */}
      <LoanForm
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={fetchData}
        editData={
          loan
            ? {
                id: loan.id,
                accountName: loan.accountName,
                loanType: loan.loanType,
                balance: loan.balance,
                originalBalance: loan.originalBalance,
                interestRate: loan.interestRate,
                termMonths: loan.termMonths,
                startDate: loan.startDate,
                monthlyPayment: loan.monthlyPayment,
                extraPaymentAmount: loan.extraPaymentAmount,
                paymentDueDay: loan.paymentDueDay,
                owner: loan.owner,
                totalInstallments: loan.totalInstallments,
                completedInstallments: loan.completedInstallments,
                installmentFrequency: loan.installmentFrequency,
                nextPaymentDate: loan.nextPaymentDate,
                merchantName: loan.merchantName,
                paymentAccountId: loan.paymentAccountId,
                feePerHundred: loan.feePerHundred,
                termDays: loan.termDays,
                dueDate: loan.dueDate,
                lenderName: loan.lenderName,
              }
            : null
        }
      />

      {/* ── Delete Confirmation Dialog ────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{loan.accountName}&quot;?
              This will deactivate the loan account. Transaction history will be
              preserved but the loan will no longer appear in your active
              accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Loan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
