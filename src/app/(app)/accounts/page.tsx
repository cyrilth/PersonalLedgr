"use client"

/**
 * Accounts list page — displays accounts grouped by type with Active/Inactive tabs.
 *
 * Groups are ordered: Checking → Savings → Credit Card → Loan → Mortgage,
 * each with a heading showing the group total. Active account cards link to
 * their detail pages. Inactive accounts show a "Reactivate" button instead.
 * Includes an "Add Account" button, skeleton loading, and empty state.
 */

import { useEffect, useState, useCallback } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AccountCard } from "@/components/accounts/account-card"
import { AccountForm } from "@/components/accounts/account-form"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { getAccounts, getInactiveAccounts, reactivateAccount, getAccountTransactions, permanentlyDeleteAccount } from "@/actions/accounts"
import { formatCurrency, formatDate } from "@/lib/utils"

type AccountGroups = Awaited<ReturnType<typeof getAccounts>>

/** Skeleton placeholder shown while account data is loading. */
function AccountsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((g) => (
        <div key={g} className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Renders a list of account groups as a grid of cards. */
function AccountGrid({
  groups,
  onReactivate,
  onPermanentDelete,
}: {
  groups: AccountGroups
  onReactivate?: (id: string) => void
  onPermanentDelete?: (id: string, name: string) => void
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.type} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {group.label}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({formatCurrency(Math.abs(group.total))})
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.accounts.map((account) => (
              <AccountCard
                key={account.id}
                {...account}
                onReactivate={onReactivate}
                onPermanentDelete={onPermanentDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export default function AccountsPage() {
  const [groups, setGroups] = useState<AccountGroups | null>(null)
  const [inactiveGroups, setInactiveGroups] = useState<AccountGroups | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTxns, setDeleteTxns] = useState<{ id: string; date: Date | string; description: string; amount: number; type: string }[]>([])
  const [deleteTxnTotal, setDeleteTxnTotal] = useState(0)
  const [deleteTxnPage, setDeleteTxnPage] = useState(1)
  const [deleteTxnTotalPages, setDeleteTxnTotalPages] = useState(1)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [active, inactive] = await Promise.all([
        getAccounts(),
        getInactiveAccounts(),
      ])
      setGroups(active)
      setInactiveGroups(inactive)
    } catch (err) {
      console.error("Failed to load accounts:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const inactiveCount = inactiveGroups
    ? inactiveGroups.reduce((sum, g) => sum + g.accounts.length, 0)
    : 0

  async function handleReactivate(id: string) {
    try {
      await reactivateAccount(id)
      toast.success("Account reactivated")
      fetchData()
    } catch (err) {
      toast.error("Failed to reactivate account")
      console.error(err)
    }
  }

  async function fetchDeleteTxns(accountId: string, page: number) {
    setDeleteLoading(true)
    try {
      const result = await getAccountTransactions(accountId, page, 10)
      setDeleteTxns(result.transactions)
      setDeleteTxnTotal(result.total)
      setDeleteTxnPage(result.page)
      setDeleteTxnTotalPages(result.totalPages)
    } catch (err) {
      console.error("Failed to load transactions:", err)
    } finally {
      setDeleteLoading(false)
    }
  }

  function handlePermanentDeleteClick(id: string, name: string) {
    setDeleteTarget({ id, name })
    setDeleteTxnPage(1)
    fetchDeleteTxns(id, 1)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await permanentlyDeleteAccount(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" permanently deleted`)
      setDeleteTarget(null)
      fetchData()
    } catch (err) {
      toast.error("Failed to delete account")
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Button onClick={() => setFormOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {loading ? (
        <AccountsSkeleton />
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive" className="gap-1.5">
              Inactive
              {inactiveCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                  {inactiveCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6 space-y-6">
            {!groups || groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
                <p className="text-muted-foreground">
                  No accounts yet. Add your first account to get started.
                </p>
                <Button onClick={() => setFormOpen(true)} variant="outline" className="mt-4">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Account
                </Button>
              </div>
            ) : (
              <AccountGrid groups={groups} />
            )}
          </TabsContent>

          <TabsContent value="inactive" className="mt-6 space-y-6">
            {!inactiveGroups || inactiveGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
                <p className="text-muted-foreground">
                  No inactive accounts.
                </p>
              </div>
            ) : (
              <AccountGrid groups={inactiveGroups} onReactivate={handleReactivate} onPermanentDelete={handlePermanentDeleteClick} />
            )}
          </TabsContent>
        </Tabs>
      )}

      <AccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchData}
      />

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible. The account and all associated data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Transaction count summary */}
          <p className="text-sm font-medium text-destructive">
            {deleteTxnTotal} transaction{deleteTxnTotal !== 1 ? "s" : ""} will be permanently deleted.
          </p>

          {/* Paginated transaction list */}
          {deleteLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : deleteTxns.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Date</th>
                    <th className="px-3 py-1.5 font-medium">Description</th>
                    <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {deleteTxns.map((txn) => (
                    <tr key={txn.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{formatDate(txn.date)}</td>
                      <td className="truncate px-3 py-1.5">{txn.description}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">{formatCurrency(txn.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No transactions.</p>
          )}

          {/* Pagination */}
          {deleteTxnTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={deleteTxnPage <= 1 || deleteLoading}
                onClick={() => { const p = deleteTxnPage - 1; setDeleteTxnPage(p); fetchDeleteTxns(deleteTarget!.id, p) }}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {deleteTxnPage} of {deleteTxnTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={deleteTxnPage >= deleteTxnTotalPages || deleteLoading}
                onClick={() => { const p = deleteTxnPage + 1; setDeleteTxnPage(p); fetchDeleteTxns(deleteTarget!.id, p) }}
              >
                Next
              </Button>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
