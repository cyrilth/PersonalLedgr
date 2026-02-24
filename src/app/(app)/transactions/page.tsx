"use client"

/**
 * Transactions page — filterable, paginated list of all user transactions.
 *
 * Features:
 * - Filter bar: account, type, category, date range, text search
 * - Sortable data table with checkbox selection
 * - Inline category editing (click category badge → dropdown)
 * - Bulk categorize bar (appears when rows are selected)
 * - Pagination (Previous / Next, page X of Y)
 * - "Add Transaction" dialog with tabs for Expense, Income, Transfer, Loan Payment
 */

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { TransactionFilterBar, EMPTY_FILTERS } from "@/components/transactions/transaction-filters"
import type { TransactionFilters } from "@/components/transactions/transaction-filters"
import { TransactionTable } from "@/components/transactions/transaction-table"
import { TransactionForm } from "@/components/transactions/transaction-form"
import { getTransactions, updateTransaction, bulkCategorize, deleteTransaction, getTransactionDeleteInfo } from "@/actions/transactions"
import { getAccountsFlat } from "@/actions/accounts"
import { getCategoryNames } from "@/actions/categories"
import { Skeleton } from "@/components/ui/skeleton"
import { useYear } from "@/contexts/year-context"

type FlatAccount = Awaited<ReturnType<typeof getAccountsFlat>>[number]

export default function TransactionsPage() {
  const { year } = useYear()
  const [filters, setFilters] = useState<TransactionFilters>({
    ...EMPTY_FILTERS,
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  })
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof getTransactions>>["transactions"]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<FlatAccount[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [bulkCategory, setBulkCategory] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; description: string } | null>(null)
  const [deleteInfo, setDeleteInfo] = useState<Awaited<ReturnType<typeof getTransactionDeleteInfo>> | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const data = await getCategoryNames()
      setCategories(data)
    } catch (err) {
      console.error("Failed to load categories:", err)
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await getAccountsFlat()
      setAccounts(data)
    } catch (err) {
      console.error("Failed to load accounts:", err)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getTransactions({
        accountId: filters.accountId || undefined,
        type: filters.type || undefined,
        category: filters.category || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        search: filters.search || undefined,
        page,
        pageSize: 50,
      })
      setTransactions(result.transactions)
      setTotalPages(result.totalPages)
      setTotal(result.total)
    } catch (err) {
      console.error("Failed to load transactions:", err)
      toast.error("Failed to load transactions")
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    fetchAccounts()
    fetchCategories()
  }, [fetchAccounts, fetchCategories])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Sync date filters when global year changes
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`,
    }))
    setPage(1)
    setSelectedIds(new Set())
  }, [year])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [filters])

  async function handleCategoryChange(id: string, category: string) {
    try {
      await updateTransaction(id, { category })
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, category } : t))
      )
    } catch (err) {
      toast.error("Failed to update category")
      console.error(err)
    }
  }

  async function handleBulkCategorize() {
    if (selectedIds.size === 0 || !bulkCategory) return
    try {
      const result = await bulkCategorize(Array.from(selectedIds), bulkCategory)
      toast.success(`Updated ${result.count} transactions`)
      setSelectedIds(new Set())
      setBulkCategory("")
      fetchTransactions()
    } catch (err) {
      toast.error("Failed to bulk categorize")
      console.error(err)
    }
  }

  function handleSuccess() {
    fetchTransactions()
    fetchAccounts()
  }

  async function handleDeleteRequest(id: string, description: string) {
    setDeleteTarget({ id, description })
    setDeleteInfo(null)
    setDeleteLoading(true)
    try {
      const info = await getTransactionDeleteInfo(id)
      setDeleteInfo(info)
    } catch {
      toast.error("Failed to load transaction details")
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteTransaction(deleteTarget.id)
      if (result.warnings.length > 0) {
        const w = result.warnings[0]
        toast.success("Transaction deleted", {
          description: `Bill payment for "${w.billName}" (${w.month}/${w.year}) was also removed.`,
        })
      } else {
        toast.success("Transaction deleted")
      }
      setDeleteTarget(null)
      setDeleteInfo(null)
      fetchTransactions()
      fetchAccounts()
    } catch {
      toast.error("Failed to delete transaction")
    } finally {
      setDeleting(false)
    }
  }

  // Derive loan accounts from the flat list
  const loanAccounts = accounts
    .filter((a) => (a.type === "LOAN" || a.type === "MORTGAGE") && a.loan)
    .map((a) => ({
      ...a,
      loan: a.loan!,
    }))

  // Derive account options for form (non-loan accounts)
  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    owner: a.owner,
    balance: a.balance,
  }))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground">
              {total} transaction{total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Transaction
        </Button>
      </div>

      {/* Filters */}
      <TransactionFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, owner: a.owner }))}
        categories={categories}
      />

      {/* Bulk categorize bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Select value={bulkCategory || "pick"} onValueChange={(v) => setBulkCategory(v === "pick" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Set category..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pick" disabled>Set category...</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!bulkCategory} onClick={handleBulkCategorize}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setSelectedIds(new Set()); setBulkCategory("") }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <TransactionTable
          transactions={transactions}
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          onCategoryChange={handleCategoryChange}
          categories={categories}
          onDelete={handleDeleteRequest}
        />
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Add Transaction Form */}
      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={handleSuccess}
        accounts={accountOptions}
        loanAccounts={loanAccounts}
        categories={categories}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteInfo(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to delete &quot;{deleteTarget?.description}&quot;? This cannot be undone.
                </p>
                {deleteLoading && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking for linked records...
                  </p>
                )}
                {deleteInfo?.hasLinkedTransfer && (
                  <p className="text-yellow-600 dark:text-yellow-500">
                    This is part of a transfer pair. The linked transaction in {deleteInfo.linkedAccountName} will also be deleted.
                  </p>
                )}
                {deleteInfo?.hasBillPayment && deleteInfo.billPaymentInfo && (
                  <p className="text-yellow-600 dark:text-yellow-500">
                    This transaction is linked to the bill &quot;{deleteInfo.billPaymentInfo.billName}&quot; for {deleteInfo.billPaymentInfo.month}/{deleteInfo.billPaymentInfo.year}. Deleting it will remove the payment record, and the bill will show as unpaid.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteLoading || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
