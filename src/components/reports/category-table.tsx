"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { ArrowUpDown } from "lucide-react"

interface CategoryRow {
  category: string
  totalSpending: number
  totalIncome: number
  transactionCount: number
}

interface CategoryTableProps {
  data: CategoryRow[]
  totalSpending: number
  totalIncome: number
  totalCount: number
}

type SortKey = "category" | "totalSpending" | "totalIncome" | "net" | "transactionCount" | "pct"
type SortDir = "asc" | "desc"

export function CategoryTable({ data, totalSpending, totalIncome, totalCount }: CategoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalSpending")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = [...data].sort((a, b) => {
    let av: number | string = 0
    let bv: number | string = 0

    switch (sortKey) {
      case "category":
        av = a.category.toLowerCase()
        bv = b.category.toLowerCase()
        return sortDir === "asc"
          ? (av as string).localeCompare(bv as string)
          : (bv as string).localeCompare(av as string)
      case "totalSpending":
        av = a.totalSpending; bv = b.totalSpending; break
      case "totalIncome":
        av = a.totalIncome; bv = b.totalIncome; break
      case "net":
        av = a.totalIncome - a.totalSpending; bv = b.totalIncome - b.totalSpending; break
      case "transactionCount":
        av = a.transactionCount; bv = b.transactionCount; break
      case "pct":
        av = totalSpending > 0 ? a.totalSpending / totalSpending : 0
        bv = totalSpending > 0 ? b.totalSpending / totalSpending : 0
        break
    }

    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const totalNet = totalIncome - totalSpending

  function SortButton({ label, col }: { label: string; col: SortKey }) {
    return (
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => toggleSort(col)}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Category Running Totals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions in this date range.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortButton label="Category" col="category" /></TableHead>
                  <TableHead className="text-right"><SortButton label="Spending" col="totalSpending" /></TableHead>
                  <TableHead className="text-right"><SortButton label="Income" col="totalIncome" /></TableHead>
                  <TableHead className="text-right"><SortButton label="Net" col="net" /></TableHead>
                  <TableHead className="text-right"><SortButton label="Count" col="transactionCount" /></TableHead>
                  <TableHead className="text-right"><SortButton label="% Spending" col="pct" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => {
                  const net = row.totalIncome - row.totalSpending
                  const pct = totalSpending > 0 ? (row.totalSpending / totalSpending) * 100 : 0

                  return (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">
                        {row.totalSpending > 0 ? formatCurrency(row.totalSpending) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                        {row.totalIncome > 0 ? formatCurrency(row.totalIncome) : "—"}
                      </TableCell>
                      <TableCell className={`text-right ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCurrency(net)}
                      </TableCell>
                      <TableCell className="text-right">{row.transactionCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-red-500"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="w-10 text-xs text-muted-foreground">
                            {pct > 0 ? `${pct.toFixed(0)}%` : "—"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(totalSpending)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalIncome)}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${totalNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(totalNet)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{totalCount}</TableCell>
                  <TableCell className="text-right font-semibold">100%</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
