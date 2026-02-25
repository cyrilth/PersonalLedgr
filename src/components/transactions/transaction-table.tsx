"use client"

/**
 * Transaction data table with checkbox selection and inline category editing.
 *
 * Desktop (md+): shadcn Table with columns for date, description, amount,
 * category, account, type, and linked-transfer icon.
 *
 * Mobile (<md): Card-based list showing key fields in a compact layout.
 */

import { useState } from "react"
import { Link2, MoreHorizontal, Trash2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants"
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
  categories?: string[]
  onDelete?: (id: string, description: string) => void
}

export function TransactionTable({
  transactions,
  selectedIds,
  onSelectChange,
  onCategoryChange,
  categories = [],
  onDelete,
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
    <>
      {/* ── Mobile card view (<md) ──────────────────────────────────── */}
      <div className="space-y-2 md:hidden">
        {/* Select-all row */}
        <label className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-gray-300"
          />
          Select all
        </label>

        {transactions.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-md border p-3",
              selectedIds.has(t.id) && "bg-muted/50"
            )}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(t.id)}
                onChange={() => toggleOne(t.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
              />
              <div className="min-w-0 flex-1">
                {/* Row 1: Description + Amount */}
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm font-medium" title={t.description}>
                    {t.description}
                  </span>
                  <span className={cn("shrink-0 text-sm font-semibold", getAmountColor(t.type))}>
                    {formatAmount(t.amount, t.type)}
                  </span>
                </div>

                {/* Row 2: Date, Account, Linked icon */}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(t.date)}</span>
                  <span>·</span>
                  <span className="truncate">{t.account.name}</span>
                  {t.linkedTransactionId && (
                    <Link2 className="h-3 w-3 shrink-0" />
                  )}
                </div>

                {/* Row 3: Type badge + Category */}
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-normal">
                    {TRANSACTION_TYPE_LABELS[t.type as TransactionType] ?? t.type}
                  </Badge>
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
                      <SelectTrigger className="h-6 w-auto text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
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
                </div>
              </div>

              {/* Actions menu */}
              {onDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(t.id, t.description)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop table view (md+) ────────────────────────────────── */}
      <div className="hidden md:block rounded-md border overflow-x-auto">
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
              {onDelete && <TableHead className="w-10" />}
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
                        {categories.map((cat) => (
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
                {onDelete && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDelete(t.id, t.description)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
