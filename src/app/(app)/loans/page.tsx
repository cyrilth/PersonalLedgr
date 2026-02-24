"use client"

/**
 * Loans list page -- displays all loan and mortgage accounts as a grid of cards
 * with a summary bar showing aggregate debt metrics.
 *
 * Layout:
 * - Header with title and "Add Loan" button
 * - Summary bar (Card): Total Debt, Total Monthly Payments, Weighted Avg APR
 * - Grid of LoanCard components (sm:grid-cols-2, lg:grid-cols-3)
 * - Skeleton loading placeholders while data is fetched
 * - Empty state with prompt to add first loan
 *
 * Follows the same client-side data-fetching pattern as the Accounts page:
 * useState + useEffect + useCallback for fetch, toast for notifications.
 */

import { useEffect, useState, useCallback } from "react"
import { Plus, TrendingDown, DollarSign, Percent } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { LoanCard } from "@/components/loans/loan-card"
import { LoanForm } from "@/components/loans/loan-form"
import { getLoans, type LoanSummary } from "@/actions/loans"
import { getAccountsFlat } from "@/actions/accounts"
import { formatCurrency } from "@/lib/utils"

// ── Skeleton ──────────────────────────────────────────────────────────

/** Skeleton placeholder shown while loan data is loading. */
function LoansSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary bar skeleton */}
      <Card>
        <CardContent className="flex flex-wrap gap-6 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Card grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-2 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────

/**
 * Displays aggregate loan metrics in a horizontal card:
 * - Total Debt: sum of absolute balances
 * - Total Monthly Payments: sum of monthly payment amounts
 * - Weighted Average APR: balance-weighted interest rate
 */
function LoanSummaryBar({ loans }: { loans: LoanSummary[] }) {
  const totalDebt = loans.reduce((sum, l) => sum + Math.abs(l.balance), 0)
  const totalMonthly = loans.reduce((sum, l) => sum + l.monthlyPayment, 0)

  // Weighted average APR: sum(rate * |balance|) / sum(|balance|)
  const weightedApr =
    totalDebt > 0
      ? loans.reduce((sum, l) => sum + l.interestRate * Math.abs(l.balance), 0) / totalDebt
      : 0

  const metrics = [
    {
      icon: TrendingDown,
      label: "Total Debt",
      value: formatCurrency(totalDebt),
      color: "text-red-500",
    },
    {
      icon: DollarSign,
      label: "Total Monthly Payments",
      value: formatCurrency(totalMonthly),
      color: "text-blue-500",
    },
    {
      icon: Percent,
      label: "Weighted Avg APR",
      value: `${weightedApr.toFixed(2)}%`,
      color: "text-amber-500",
    },
  ]

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-6 py-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-3">
            <div className={`rounded-full bg-muted p-2.5 ${m.color}`}>
              <m.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-lg font-semibold">{m.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Page Component ────────────────────────────────────────────────────

export default function LoansPage() {
  const [loans, setLoans] = useState<LoanSummary[] | null>(null)
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const fetchLoans = useCallback(async () => {
    setLoading(true)
    try {
      const [data, accts] = await Promise.all([getLoans(), getAccountsFlat()])
      setLoans(data)
      // Filter to checking/savings accounts for BNPL payment account selection
      setAccounts(
        accts
          .filter((a) => a.type === "CHECKING" || a.type === "SAVINGS")
          .map((a) => ({ id: a.id, name: a.name }))
      )
    } catch (err) {
      console.error("Failed to load loans:", err)
      toast.error("Failed to load loans")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLoans()
  }, [fetchLoans])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Loans</h1>
        <Button onClick={() => setFormOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Loan
        </Button>
      </div>

      {loading ? (
        <LoansSkeleton />
      ) : !loans || loans.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">
            No loans yet. Add your first loan or mortgage to get started.
          </p>
          <Button onClick={() => setFormOpen(true)} variant="outline" className="mt-4">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Loan
          </Button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <LoanSummaryBar loans={loans} />

          {/* Loan card grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loans.map((loan) => (
              <LoanCard key={loan.id} {...loan} />
            ))}
          </div>
        </>
      )}

      {/* Add/Edit loan dialog */}
      <LoanForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchLoans}
        accounts={accounts}
      />
    </div>
  )
}
