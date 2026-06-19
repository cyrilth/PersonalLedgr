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
import { toast } from "sonner"
import { Link2, MoreHorizontal, Percent, Trash2 } from "lucide-react"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
import { getAprRates } from "@/actions/apr-rates"
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants"
import type { TransactionType } from "@/lib/constants"
import { formatDate, getAmountColor, formatAmount, cn } from "@/lib/utils"

interface AprRateSummary {
  id: string
  rateType: string
  apr: number
  description: string | null
  isActive?: boolean
}

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
  aprRateId?: string | null
  aprRate?: AprRateSummary | null
}

interface TransactionTableProps {
  transactions: Transaction[]
  selectedIds: Set<string>
  onSelectChange: (ids: Set<string>) => void
  onCategoryChange: (id: string, category: string) => void
  categories?: string[]
  onDelete?: (id: string, description: string) => void
  /**
   * Assign or clear the per-transaction APR rate on a credit-card transaction.
   * Pass `null` to clear (fall back to the account's standard rate).
   */
  onAprChange?: (id: string, aprRateId: string | null) => void | Promise<void>
}

export function TransactionTable({
  transactions,
  selectedIds,
  onSelectChange,
  onCategoryChange,
  categories = [],
  onDelete,
  onAprChange,
}: TransactionTableProps) {
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)

  // APR-rate editor dialog state (credit-card transactions only)
  const [aprTarget, setAprTarget] = useState<Transaction | null>(null)
  const [aprRates, setAprRates] = useState<AprRateSummary[]>([])
  const [aprValue, setAprValue] = useState<string>("none")
  const [aprLoading, setAprLoading] = useState(false)
  const [aprSaving, setAprSaving] = useState(false)

  const allSelected =
    transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))

  async function openAprEditor(t: Transaction) {
    setAprTarget(t)
    setAprValue(t.aprRateId ?? "none")
    setAprRates([])
    setAprLoading(true)
    try {
      const rates = await getAprRates(t.account.id)
      // Only active rates are assignable — the interest-accrual job ignores
      // inactive ones and would charge the standard rate instead.
      setAprRates(rates.filter((r) => r.isActive))
    } catch {
      toast.error("Failed to load APR rates")
    } finally {
      setAprLoading(false)
    }
  }

  async function handleAprSave() {
    if (!aprTarget || !onAprChange) return
    setAprSaving(true)
    try {
      await onAprChange(aprTarget.id, aprValue === "none" ? null : aprValue)
      setAprTarget(null)
    } catch {
      // The page-level handler surfaces its own error toast.
    } finally {
      setAprSaving(false)
    }
  }

  /**
   * True only for credit-card EXPENSE purchases — the one shape the interest
   * job actually accrues on. Mirrors the server-side applicability rule so the
   * "Set APR rate" action never appears on payments, refunds, or interest rows.
   */
  function canEditApr(t: Transaction) {
    return !!onAprChange && t.account.type === "CREDIT_CARD" && t.type === "EXPENSE"
  }

  /**
   * Small badge shown when a non-standard (promo/intro) rate is attached.
   * Hidden when the accrual job wouldn't honor the link — an inactive rate, or
   * a non-expense row — so the badge never misrepresents the interest charged.
   */
  function renderAprBadge(t: Transaction) {
    if (
      !t.aprRate ||
      t.aprRate.rateType === "STANDARD" ||
      t.aprRate.isActive === false ||
      t.type !== "EXPENSE"
    ) {
      return null
    }
    return (
      <Badge
        variant="secondary"
        className="text-xs font-normal whitespace-nowrap"
        title={t.aprRate.description || t.aprRate.rateType}
      >
        {(t.aprRate.apr * 100).toFixed(2)}% APR
      </Badge>
    )
  }

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
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs font-normal">
                    {TRANSACTION_TYPE_LABELS[t.type as TransactionType] ?? t.type}
                  </Badge>
                  {renderAprBadge(t)}
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
              {(onDelete || canEditApr(t)) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEditApr(t) && (
                      <DropdownMenuItem onClick={() => openAprEditor(t)}>
                        <Percent className="mr-2 h-4 w-4" />
                        Set APR rate
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(t.id, t.description)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
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
              {(onDelete || onAprChange) && <TableHead className="w-10" />}
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">
                      {TRANSACTION_TYPE_LABELS[t.type as TransactionType] ?? t.type}
                    </Badge>
                    {renderAprBadge(t)}
                  </div>
                </TableCell>
                <TableCell>
                  {t.linkedTransactionId && (
                    <span title="Linked transfer">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  )}
                </TableCell>
                {(onDelete || onAprChange) && (
                  <TableCell>
                    {(onDelete || canEditApr(t)) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditApr(t) && (
                            <DropdownMenuItem onClick={() => openAprEditor(t)}>
                              <Percent className="mr-2 h-4 w-4" />
                              Set APR rate
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDelete(t.id, t.description)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── APR rate editor (credit-card transactions) ──────────────── */}
      <Dialog open={!!aprTarget} onOpenChange={(open) => { if (!open) setAprTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set APR Rate</DialogTitle>
            <DialogDescription>
              Choose which APR rate applies to &quot;{aprTarget?.description}&quot;. Select
              Default to use the card&apos;s standard rate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="edit-apr">APR Rate</Label>
            <Select
              value={aprValue}
              onValueChange={setAprValue}
              disabled={aprLoading || aprSaving}
            >
              <SelectTrigger id="edit-apr" className="w-full">
                <SelectValue placeholder={aprLoading ? "Loading rates..." : "Default rate"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default (standard rate)</SelectItem>
                {aprRates.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.description || r.rateType} — {(r.apr * 100).toFixed(2)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!aprLoading && aprRates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No APR rates defined for this card yet. Add one from the account page.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAprTarget(null)} disabled={aprSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAprSave} disabled={aprLoading || aprSaving}>
              {aprSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
