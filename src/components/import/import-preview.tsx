"use client"

/**
 * Import preview/review component for the CSV import wizard.
 *
 * Displays all parsed and normalized transactions with duplicate detection
 * results. Users can toggle individual rows or use bulk select/deselect
 * before confirming the import.
 *
 * Duplicate detection statuses:
 * - "new"       : No matching transaction found (auto-selected for import)
 * - "duplicate" : Exact match on date + amount + description (auto-deselected)
 * - "review"    : Fuzzy match (Levenshtein < 3) — needs manual review
 */

import {
  ArrowLeft,
  ArrowLeftRight,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import type { ImportRow, ReconcileMatch } from "@/actions/import"

interface ImportPreviewProps {
  rows: ImportRow[]
  onRowToggle: (index: number) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDismissReconcile: (index: number) => void
  onSelectCandidate: (index: number, candidate: ReconcileMatch) => void
  onImport: () => void
  onBack: () => void
  importing: boolean
}

/**
 * Renders a status badge for a given duplicate detection result.
 * Includes the matching description text for duplicate/review rows.
 */
function StatusBadge({
  row,
  usedTransactionIds,
  onDismiss,
  onSelectCandidate,
}: {
  row: ImportRow
  usedTransactionIds: Set<string>
  onDismiss: () => void
  onSelectCandidate: (candidate: ReconcileMatch) => void
}) {
  switch (row.status) {
    case "new":
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
          <CheckCircle className="mr-1 h-3 w-3" />
          New
        </Badge>
      )
    case "duplicate":
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Duplicate
          </Badge>
          {row.matchDescription && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[200px]"
              title={row.matchDescription}
            >
              Matches: {row.matchDescription}
            </span>
          )}
        </div>
      )
    case "review":
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            <AlertCircle className="mr-1 h-3 w-3" />
            Review
          </Badge>
          {row.matchDescription && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[200px]"
              title={row.matchDescription}
            >
              Similar: {row.matchDescription}
            </span>
          )}
        </div>
      )
    case "reconcile": {
      const candidates = row.reconcileCandidates || []
      const hasMultiple = candidates.length > 1
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <ArrowLeftRight className="mr-1 h-3 w-3" />
              Reconcile
            </Badge>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Dismiss match — import as new transaction"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {hasMultiple ? (
            <Select
              value={row.reconcileMatch?.transactionId ?? ""}
              onValueChange={(txId) => {
                const picked = candidates.find((c) => c.transactionId === txId)
                if (picked) onSelectCandidate(picked)
              }}
            >
              <SelectTrigger className="h-7 text-xs w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => {
                  const inUse =
                    usedTransactionIds.has(c.transactionId) &&
                    c.transactionId !== row.reconcileMatch?.transactionId
                  return (
                    <SelectItem
                      key={c.transactionId}
                      value={c.transactionId}
                      disabled={inUse}
                    >
                      {c.billName}
                      {inUse ? " (in use)" : ""}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          ) : row.reconcileMatch ? (
            <span
              className="text-xs text-muted-foreground truncate max-w-[200px]"
              title={`Replaces: ${row.reconcileMatch.billName}`}
            >
              Replaces: {row.reconcileMatch.billName}
            </span>
          ) : null}
        </div>
      )
    }
  }
}

/**
 * Import preview table with summary stats, bulk selection controls,
 * and a confirmation button to trigger the actual import.
 */
export function ImportPreview({
  rows,
  onRowToggle,
  onSelectAll,
  onDeselectAll,
  onDismissReconcile,
  onSelectCandidate,
  onImport,
  onBack,
  importing,
}: ImportPreviewProps) {
  const usedTransactionIds = new Set(
    rows
      .filter((r) => r.status === "reconcile" && r.reconcileMatch)
      .map((r) => r.reconcileMatch!.transactionId)
  )

  const newCount = rows.filter((r) => r.status === "new").length
  const duplicateCount = rows.filter((r) => r.status === "duplicate").length
  const reviewCount = rows.filter((r) => r.status === "review").length
  const reconcileCount = rows.filter((r) => r.status === "reconcile").length
  const selectedCount = rows.filter((r) => r.selected).length

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              <CheckCircle className="mr-1 h-3 w-3" />
              {newCount} New
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" />
              {duplicateCount} Duplicate
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              <AlertCircle className="mr-1 h-3 w-3" />
              {reviewCount} Review
            </Badge>
          </div>
          {reconcileCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                <ArrowLeftRight className="mr-1 h-3 w-3" />
                {reconcileCount} Reconcile
              </Badge>
            </div>
          )}
          <div className="ml-auto text-sm text-muted-foreground">
            {selectedCount} of {rows.length} selected for import
          </div>
        </CardContent>
      </Card>

      {/* Bulk selection controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={onDeselectAll}>
          Deselect All
        </Button>
      </div>

      {/* Transaction table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
              <TableHead className="w-32">Category</TableHead>
              <TableHead className="w-36">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.index}
                className={cn(
                  row.selected && "bg-muted/50",
                  row.status === "duplicate" && !row.selected && "opacity-60"
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={row.selected}
                    onCheckedChange={() => onRowToggle(row.index)}
                    aria-label={`Select transaction: ${row.description}`}
                  />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(row.date + "T00:00:00")}
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate text-sm"
                  title={row.description}
                >
                  {row.description}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-sm font-medium whitespace-nowrap",
                    row.amount < 0 ? "text-negative" : "text-positive"
                  )}
                >
                  {formatCurrency(row.amount)}
                </TableCell>
                <TableCell className="text-sm">
                  {row.category ? (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {row.category}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground italic">&mdash;</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    row={row}
                    usedTransactionIds={usedTransactionIds}
                    onDismiss={() => onDismissReconcile(row.index)}
                    onSelectCandidate={(candidate) => onSelectCandidate(row.index, candidate)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onImport}
          disabled={importing || selectedCount === 0}
        >
          {importing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {importing
            ? "Importing..."
            : `Import ${selectedCount} Transaction${selectedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  )
}
