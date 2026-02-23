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
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TransactionFilterBar, EMPTY_FILTERS } from "@/components/transactions/transaction-filters"
import type { TransactionFilters } from "@/components/transactions/transaction-filters"
import { TransactionTable } from "@/components/transactions/transaction-table"
import { TransactionForm } from "@/components/transactions/transaction-form"
import { getTransactions, updateTransaction, bulkCategorize } from "@/actions/transactions"
import { getAccountsFlat } from "@/actions/accounts"
import { DEFAULT_CATEGORIES } from "@/lib/constants"
import { Skeleton } from "@/components/ui/skeleton"

type FlatAccount = Awaited<ReturnType<typeof getAccountsFlat>>[number]

export default function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS)
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof getTransactions>>["transactions"]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<FlatAccount[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [bulkCategory, setBulkCategory] = useState("")

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
  }, [fetchAccounts])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

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
              {DEFAULT_CATEGORIES.map((cat) => (
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
      />
    </div>
  )
}
