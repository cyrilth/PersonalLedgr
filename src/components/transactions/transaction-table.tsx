"use client"

/**
 * Transaction data table with checkbox selection and inline category editing.
 *
 * Uses shadcn Table components. Each row shows date, description, amount
 * (color-coded by type), category (clickable for inline edit), account,
 * type badge, and a link icon for transfer pairs.
 */

import { useState } from "react"
import { Link2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TRANSACTION_TYPE_LABELS, DEFAULT_CATEGORIES } from "@/lib/constants"
import type { TransactionType } from "@/lib/constants"
import { formatDate, getAmountColor, formatAmount, cn } from "@/lib/utils"

interface Transaction {
  id: string
  date: Date | string
  description: string
  amount: number
  type: string
  category: string | null
  source: string
  notes: string | null
  accountId: string
  account: { id: string; name: string; type: string }
  linkedTransactionId: string | null
}

interface TransactionTableProps {
  transactions: Transaction[]
  selectedIds: Set<string>
  onSelectChange: (ids: Set<string>) => void
  onCategoryChange: (id: string, category: string) => void
}

export function TransactionTable({
  transactions,
  selectedIds,
  onSelectChange,
  onCategoryChange,
}: TransactionTableProps) {
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)

  const allSelected =
    transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))

  function toggleAll() {
    if (allSelected) {
      onSelectChange(new Set())
    } else {
      onSelectChange(new Set(transactions.map((t) => t.id)))
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectChange(next)
  }

  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No transactions found.
      </p>
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300"
              />
            </TableHead>
            <TableHead className="w-28">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-28 text-right">Amount</TableHead>
            <TableHead className="w-36">Category</TableHead>
            <TableHead className="w-32">Account</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => (
            <TableRow key={t.id} className={selectedIds.has(t.id) ? "bg-muted/50" : undefined}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selectedIds.has(t.id)}
                  onChange={() => toggleOne(t.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {formatDate(t.date)}
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm" title={t.description}>
                {t.description}
              </TableCell>
              <TableCell className={cn("text-right text-sm font-medium whitespace-nowrap", getAmountColor(t.type))}>
                {formatAmount(t.amount, t.type)}
              </TableCell>
              <TableCell>
                {editingCategoryId === t.id ? (
                  <Select
                    defaultValue={t.category || ""}
                    onValueChange={(val) => {
                      onCategoryChange(t.id, val)
                      setEditingCategoryId(null)
                    }}
                    onOpenChange={(open) => {
                      if (!open) setEditingCategoryId(null)
                    }}
                    defaultOpen
                  >
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <button
                    type="button"
                    className="text-left text-xs hover:underline cursor-pointer"
                    onClick={() => setEditingCategoryId(t.id)}
                    title="Click to change category"
                  >
                    {t.category ? (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {t.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </button>
                )}
              </TableCell>
              <TableCell className="text-sm truncate" title={t.account.name}>
                {t.account.name}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">
                  {TRANSACTION_TYPE_LABELS[t.type as TransactionType] ?? t.type}
                </Badge>
              </TableCell>
              <TableCell>
                {t.linkedTransactionId && (
                  <span title="Linked transfer">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
