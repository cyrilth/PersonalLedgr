"use client"

import { useEffect, useState, useCallback } from "react"
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getAccountTransactions } from "@/actions/accounts"
import { formatDateShort, getAmountColor, formatAmount, cn } from "@/lib/utils"

type AmountFilter = "all" | "positive" | "negative"
type SortOrder = "asc" | "desc"

type Transaction = {
  id: string
  date: Date
  description: string
  amount: number
  type: string
  category: string | null
}

type TransactionsData = {
  transactions: Transaction[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function AccountTransactions({ accountId }: { accountId: string }) {
  const [data, setData] = useState<TransactionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("all")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAccountTransactions(accountId, {
        page,
        pageSize: 20,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        amountFilter,
        sortOrder,
      })
      setData(result as TransactionsData)
    } catch {
      // Error handled silently — data stays null
    } finally {
      setLoading(false)
    }
  }, [accountId, page, dateFrom, dateTo, amountFilter, sortOrder])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Reset page when filters change
  const updateFilter = <T,>(setter: (v: T) => void, value: T) => {
    setter(value)
    setPage(1)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Transactions</CardTitle>
          {data && (
            <Badge variant="secondary" className="text-xs">
              {data.total}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => updateFilter(setDateFrom, e.target.value)}
              className="h-8 w-auto text-xs"
              aria-label="From date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => updateFilter(setDateTo, e.target.value)}
              className="h-8 w-auto text-xs"
              aria-label="To date"
            />
          </div>

          <div className="flex items-center gap-1">
            {(["all", "positive", "negative"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={amountFilter === f ? "default" : "outline"}
                className="h-8 px-3 text-xs capitalize"
                onClick={() => updateFilter(setAmountFilter, f)}
              >
                {f === "all" ? "All" : f === "positive" ? "Positive" : "Negative"}
              </Button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 gap-1 text-xs"
            onClick={() => updateFilter(setSortOrder, sortOrder === "desc" ? "asc" : "desc")}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortOrder === "desc" ? "Newest" : "Oldest"}
          </Button>
        </div>

        {/* Transaction list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : data && data.transactions.length > 0 ? (
          <div className="divide-y">
            {data.transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateShort(t.date)}
                    {t.category && (
                      <span className="ml-2">{t.category}</span>
                    )}
                  </p>
                </div>
                <span className={cn("ml-4 text-sm font-medium whitespace-nowrap", getAmountColor(t.type))}>
                  {formatAmount(t.amount, t.type)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No transactions found.
          </p>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-muted-foreground text-xs">
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
