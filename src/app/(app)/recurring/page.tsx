"use client"

/**
 * Recurring bills list/calendar page -- displays all recurring bills in a
 * grid or calendar view, grouped by payment account.
 *
 * Layout:
 * - Header with title, view toggle (grid/calendar), and "Add Bill" button
 * - Summary bar (Card): Total Monthly Cost, Number of Bills, Estimated count
 * - Grid view: bills grouped by payment account
 * - Calendar view: BillsCalendar showing bills by day-of-month
 * - Skeleton loading placeholders while data is fetched
 * - Empty state with prompt to add first bill
 * - Delete confirmation via AlertDialog
 *
 * Follows the same client-side data-fetching pattern as the Loans page:
 * useState + useEffect + useCallback for fetch, toast for notifications.
 */

import { useEffect, useState, useCallback } from "react"
import {
  Plus,
  DollarSign,
  Receipt,
  AlertCircle,
  LayoutGrid,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { BillCard } from "@/components/recurring/bill-card"
import { BillForm } from "@/components/recurring/bill-form"
import { BillsCalendar } from "@/components/recurring/bills-calendar"
import {
  getRecurringBills,
  deleteRecurringBill,
  type RecurringBillSummary,
} from "@/actions/recurring"
import { getAccountsFlat } from "@/actions/accounts"
import { getCategoryNames } from "@/actions/categories"
import { formatCurrency, cn } from "@/lib/utils"

// ── Skeleton ──────────────────────────────────────────────────────────

/** Skeleton placeholder shown while recurring bill data is loading. */
function RecurringSkeleton() {
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
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-full" />
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
 * Displays aggregate recurring bill metrics in a horizontal card:
 * - Total Monthly Cost: all bills normalized to monthly equivalent
 * - Number of Bills: total count
 * - Estimated Bills: count of variable-amount bills
 */
function BillSummaryBar({ bills }: { bills: RecurringBillSummary[] }) {
  // Calculate monthly-equivalent total
  const totalMonthlyCost = bills.reduce((sum, bill) => {
    switch (bill.frequency) {
      case "MONTHLY":
        return sum + bill.amount
      case "QUARTERLY":
        return sum + bill.amount / 3
      case "ANNUAL":
        return sum + bill.amount / 12
      default:
        return sum + bill.amount
    }
  }, 0)

  const estimatedCount = bills.filter((b) => b.isVariableAmount).length

  const metrics = [
    {
      icon: DollarSign,
      label: "Total Monthly Cost",
      value: formatCurrency(totalMonthlyCost),
      color: "text-emerald-500",
    },
    {
      icon: Receipt,
      label: "Number of Bills",
      value: bills.length.toString(),
      color: "text-blue-500",
    },
    {
      icon: AlertCircle,
      label: "Estimated Bills",
      value:
        estimatedCount > 0
          ? `${estimatedCount} bill${estimatedCount !== 1 ? "s" : ""} are estimated`
          : "None",
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

export default function RecurringBillsPage() {
  const [bills, setBills] = useState<RecurringBillSummary[] | null>(null)
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editData, setEditData] = useState<{
    id: string
    name: string
    amount: number
    frequency: string
    dayOfMonth: number
    isVariableAmount: boolean
    category: string | null
    accountId: string
  } | null>(null)
  const [view, setView] = useState<"grid" | "calendar">("grid")
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [billsData, accountsData, categoryNames] = await Promise.all([
        getRecurringBills(),
        getAccountsFlat(),
        getCategoryNames(),
      ])
      setBills(billsData)
      setAccounts(
        accountsData.map((a: { id: string; name: string }) => ({
          id: a.id,
          name: a.name,
        }))
      )
      setCategories(categoryNames)
    } catch (err) {
      console.error("Failed to load recurring bills:", err)
      toast.error("Failed to load recurring bills")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /** Open the form dialog in edit mode with the given bill's data. */
  function handleEdit(bill: RecurringBillSummary) {
    setEditData({
      id: bill.id,
      name: bill.name,
      amount: bill.amount,
      frequency: bill.frequency,
      dayOfMonth: bill.dayOfMonth,
      isVariableAmount: bill.isVariableAmount,
      category: bill.category,
      accountId: bill.account.id,
    })
    setFormOpen(true)
  }

  /** Confirm and execute bill deletion (soft delete). */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await deleteRecurringBill(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" has been deleted`)
      setDeleteTarget(null)
      fetchData()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred"
      toast.error(message)
    }
  }

  /** Group bills by their payment account ID. */
  function groupByAccount(
    billsList: RecurringBillSummary[]
  ): Map<string, { accountName: string; bills: RecurringBillSummary[] }> {
    const groups = new Map<
      string,
      { accountName: string; bills: RecurringBillSummary[] }
    >()
    for (const bill of billsList) {
      const existing = groups.get(bill.account.id)
      if (existing) {
        existing.bills.push(bill)
      } else {
        groups.set(bill.account.id, {
          accountName: bill.account.name,
          bills: [bill],
        })
      }
    }
    return groups
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Recurring Bills</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 rounded-r-none px-2.5",
                view === "grid" && "bg-muted"
              )}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="sr-only">Grid view</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 rounded-l-none px-2.5",
                view === "calendar" && "bg-muted"
              )}
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="h-4 w-4" />
              <span className="sr-only">Calendar view</span>
            </Button>
          </div>

          <Button
            onClick={() => {
              setEditData(null)
              setFormOpen(true)
            }}
            size="sm"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Bill
          </Button>
        </div>
      </div>

      {loading ? (
        <RecurringSkeleton />
      ) : !bills || bills.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">
            No recurring bills yet. Add your first recurring bill to get
            started.
          </p>
          <Button
            onClick={() => {
              setEditData(null)
              setFormOpen(true)
            }}
            variant="outline"
            className="mt-4"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Bill
          </Button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <BillSummaryBar bills={bills} />

          {/* Grid view: bills grouped by payment account */}
          {view === "grid" && (
            <div className="space-y-6">
              {Array.from(groupByAccount(bills).entries()).map(
                ([accountId, group]) => (
                  <div key={accountId} className="space-y-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.accountName}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {group.bills.map((bill) => (
                        <BillCard
                          key={bill.id}
                          {...bill}
                          onEdit={() => handleEdit(bill)}
                          onDelete={() =>
                            setDeleteTarget({ id: bill.id, name: bill.name })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Calendar view */}
          {view === "calendar" && (
            <Card>
              <CardContent className="py-4">
                <BillsCalendar bills={bills} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Add/Edit bill dialog */}
      <BillForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditData(null)
        }}
        onSuccess={fetchData}
        editData={editData}
        accounts={accounts}
        categories={categories}
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
            <AlertDialogTitle>Delete Recurring Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This will deactivate the bill and stop future auto-generation.
              Existing transactions will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
