"use client"

/**
 * Budgets management page -- displays budget bars for the selected month
 * with a summary of total budgeted vs total spent.
 *
 * Layout:
 * - Header with title, month selector, "Add Budget" and "Copy from Previous Month" buttons
 * - Summary bar (Card): Total Budgeted, Total Spent, Remaining
 * - Grid of BudgetBar components (sm:grid-cols-1 lg:grid-cols-2)
 * - Skeleton loading placeholders while data is fetched
 * - Empty state with prompt to add first budget or copy from previous month
 *
 * Follows the same client-side data-fetching pattern as the Loans page:
 * useState + useEffect + useCallback for fetch, toast for notifications.
 */

import { useEffect, useState, useCallback } from "react"
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  TrendingDown,
  PiggyBank,
  Copy,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
  getBudgetVsActual,
  deleteBudget,
  copyBudgets,
  type BudgetVsActual,
} from "@/actions/budgets"
import { BudgetBar } from "@/components/budgets/budget-bar"
import { BudgetForm } from "@/components/budgets/budget-form"
import { formatCurrency } from "@/lib/utils"
import { useYear } from "@/contexts/year-context"

// ── Helpers ──────────────────────────────────────────────────────────

/** Format a "YYYY-MM" period string as "January 2026". */
function formatPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

/** Return the previous month period string for copy-from-previous. */
function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// ── Skeleton ─────────────────────────────────────────────────────────

/** Skeleton placeholder shown while budget data is loading. */
function BudgetsSkeleton() {
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

      {/* Budget bar grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 py-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Summary Bar ──────────────────────────────────────────────────────

/**
 * Displays aggregate budget metrics in a horizontal card:
 * - Total Budgeted: sum of all budget limits
 * - Total Spent: sum of all actual amounts
 * - Remaining: total budgeted minus total spent
 */
function BudgetSummaryBar({ budgets }: { budgets: BudgetVsActual[] }) {
  const totalBudgeted = budgets.reduce((sum, b) => sum + b.limit, 0)
  const totalSpent = budgets.reduce((sum, b) => sum + b.actual, 0)
  const remaining = totalBudgeted - totalSpent

  const metrics = [
    {
      icon: DollarSign,
      label: "Total Budgeted",
      value: formatCurrency(totalBudgeted),
      color: "text-blue-500",
    },
    {
      icon: TrendingDown,
      label: "Total Spent",
      value: formatCurrency(totalSpent),
      color: "text-red-500",
    },
    {
      icon: PiggyBank,
      label: "Remaining",
      value: formatCurrency(Math.abs(remaining)),
      color: remaining >= 0 ? "text-green-500" : "text-red-500",
      prefix: remaining < 0 ? "-" : "",
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
              <p className="text-lg font-semibold">
                {m.prefix}
                {m.value}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Page Component ───────────────────────────────────────────────────

export default function BudgetsPage() {
  const { year } = useYear()
  const [budgets, setBudgets] = useState<BudgetVsActual[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editData, setEditData] = useState<{
    id: string
    category: string
    limit: number
  } | null>(null)
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Sync period year when global year changes
  useEffect(() => {
    setPeriod((prev) => {
      const month = prev.split("-")[1]
      return `${year}-${month}`
    })
  }, [year])

  /** Navigate forward or backward one month. */
  function navigateMonth(direction: -1 | 1) {
    const [y, m] = period.split("-").map(Number)
    const d = new Date(y, m - 1 + direction, 1)
    setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  const fetchBudgets = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getBudgetVsActual(period)
      setBudgets(data)
    } catch (err) {
      console.error("Failed to load budgets:", err)
      toast.error("Failed to load budgets")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchBudgets()
  }, [fetchBudgets])

  /** Copy budgets from the previous month into the current period. */
  async function handleCopyFromPrevious() {
    try {
      const prev = previousPeriod(period)
      const result = await copyBudgets(prev, period)
      if (result.copied === 0) {
        toast.info("All categories already exist in this month")
        return
      }
      toast.success(`Copied ${result.copied} budget(s) from previous month`)
      fetchBudgets()
    } catch {
      toast.error("Failed to copy budgets")
    }
  }

  /** Delete a budget by ID after confirmation. */
  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteBudget(deleteTarget)
      toast.success("Budget deleted")
      setDeleteTarget(null)
      fetchBudgets()
    } catch {
      toast.error("Failed to delete budget")
      setDeleteTarget(null)
    }
  }

  /** Open the form in edit mode. */
  function handleEdit(budget: { id: string; category: string; limit: number }) {
    setEditData(budget)
    setFormOpen(true)
  }

  /** Handle form close -- clear edit data. */
  function handleFormOpenChange(open: boolean) {
    setFormOpen(open)
    if (!open) setEditData(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>

        <div className="flex items-center gap-2">
          {/* Month selector */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium">
            {formatPeriodLabel(period)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Action buttons */}
          <Button onClick={handleCopyFromPrevious} variant="outline" size="sm">
            <Copy className="mr-1.5 h-4 w-4" />
            Copy from Previous Month
          </Button>
          <Button onClick={() => setFormOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Budget
          </Button>
        </div>
      </div>

      {loading ? (
        <BudgetsSkeleton />
      ) : !budgets || budgets.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-center text-muted-foreground">
            No budgets for this month. Add your first budget or copy from a
            previous month.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setFormOpen(true)} variant="outline">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Budget
            </Button>
            <Button onClick={handleCopyFromPrevious} variant="outline">
              <Copy className="mr-1.5 h-4 w-4" />
              Copy from Previous Month
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <BudgetSummaryBar budgets={budgets} />

          {/* Budget bar grid */}
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {budgets.map((budget) => (
              <BudgetBar
                key={budget.id}
                {...budget}
                onEdit={() =>
                  handleEdit({
                    id: budget.id,
                    category: budget.category,
                    limit: budget.limit,
                  })
                }
                onDelete={() => setDeleteTarget(budget.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Add/Edit budget dialog */}
      <BudgetForm
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        onSuccess={fetchBudgets}
        period={period}
        editData={editData}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this budget? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
