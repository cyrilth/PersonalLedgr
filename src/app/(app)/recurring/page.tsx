"use client"

/**
 * Recurring bills page — displays bills in three tabs:
 * 1. Bills (grid view grouped by account)
 * 2. Calendar (day-of-month calendar view)
 * 3. Ledger (multi-month payment tracking grid)
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
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
import { PaymentLedger } from "@/components/recurring/payment-ledger"
import {
  getRecurringBills,
  deleteRecurringBill,
  type RecurringBillSummary,
} from "@/actions/recurring"
import { getAccountsFlat } from "@/actions/accounts"
import { getCategoryNames } from "@/actions/categories"
import { formatCurrency } from "@/lib/utils"

// ── Skeleton ──────────────────────────────────────────────────────────

function RecurringSkeleton() {
  return (
    <div className="space-y-6">
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

function BillSummaryBar({ bills }: { bills: RecurringBillSummary[] }) {
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

      {loading ? (
        <RecurringSkeleton />
      ) : !bills || bills.length === 0 ? (
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
          <BillSummaryBar bills={bills} />

          <Tabs defaultValue="ledger">
            <TabsList>
              <TabsTrigger value="bills">Bills</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
            </TabsList>

            {/* Bills tab: grid grouped by payment account */}
            <TabsContent value="bills">
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
            </TabsContent>

            {/* Calendar tab */}
            <TabsContent value="calendar">
              <Card>
                <CardContent className="py-4">
                  <BillsCalendar bills={bills} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Ledger tab: payment tracking grid */}
            <TabsContent value="ledger">
              <PaymentLedger bills={bills} accounts={accounts} />
            </TabsContent>
          </Tabs>
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
