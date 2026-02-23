"use client"

/**
 * Column mapping component for the CSV import wizard.
 *
 * Allows users to map CSV column headers to transaction fields (date,
 * description, category, amount) with support for three amount patterns:
 *
 *   Pattern 1 — Single signed amount column (positive/negative values)
 *   Pattern 2 — Separate debit and credit columns
 *   Pattern 3 — Amount column + type indicator column (e.g., "DR"/"CR")
 *
 * The component starts with auto-detected column mappings from the
 * `detected` prop and shows a live preview table of the first 5 rows
 * with normalized amounts so users can verify before proceeding.
 */

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, Columns } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { normalizeAmounts } from "@/actions/import"
import type {
  AmountPattern,
  ColumnMapping,
  CSVRow,
  DetectedColumns,
  NormalizedTransaction,
} from "@/actions/import"

// ── Props ───────────────────────────────────────────────────────────

interface ColumnMapperProps {
  headers: string[]
  sampleRows: CSVRow[]
  detected: DetectedColumns
  onMappingConfirm: (mapping: ColumnMapping) => void
  onBack: () => void
}

// ── Pattern definitions ─────────────────────────────────────────────

/** The three supported amount column patterns. */
const AMOUNT_PATTERNS = [
  { value: "single" as const, label: "Single Amount Column" },
  { value: "separate" as const, label: "Separate Debit/Credit Columns" },
  { value: "indicator" as const, label: "Amount + Type Indicator" },
]

/** Sentinel value for "not selected" in column dropdowns. */
const NONE = "__none__"

// ── Component ───────────────────────────────────────────────────────

export function ColumnMapper({
  headers,
  sampleRows,
  detected,
  onMappingConfirm,
  onBack,
}: ColumnMapperProps) {
  // ── State: selected pattern type ────────────────────────────────
  /** Which of the 3 amount patterns the user has selected. */
  const [patternType, setPatternType] = useState<"single" | "separate" | "indicator">(
    detected.amountPattern?.type ?? "single"
  )

  // ── State: common column indices ────────────────────────────────
  /** Index of the CSV column mapped to the transaction date. */
  const [dateColumn, setDateColumn] = useState<number | null>(detected.dateColumn)
  /** Index of the CSV column mapped to the transaction description. */
  const [descriptionColumn, setDescriptionColumn] = useState<number | null>(
    detected.descriptionColumn
  )
  /** Index of the CSV column mapped to the category (optional). */
  const [categoryColumn, setCategoryColumn] = useState<number | null>(
    detected.categoryColumn
  )

  // ── State: pattern-specific columns ─────────────────────────────
  /** Amount column index for pattern 1 (single) and pattern 3 (indicator). */
  const [amountColumn, setAmountColumn] = useState<number | null>(
    detected.amountPattern?.type === "single"
      ? detected.amountPattern.amountColumn
      : detected.amountPattern?.type === "indicator"
        ? detected.amountPattern.amountColumn
        : null
  )
  /** Debit column index for pattern 2 (separate). */
  const [debitColumn, setDebitColumn] = useState<number | null>(
    detected.amountPattern?.type === "separate"
      ? detected.amountPattern.debitColumn
      : null
  )
  /** Credit column index for pattern 2 (separate). */
  const [creditColumn, setCreditColumn] = useState<number | null>(
    detected.amountPattern?.type === "separate"
      ? detected.amountPattern.creditColumn
      : null
  )
  /** Indicator column index for pattern 3. */
  const [indicatorColumn, setIndicatorColumn] = useState<number | null>(
    detected.amountPattern?.type === "indicator"
      ? detected.amountPattern.indicatorColumn
      : null
  )
  /** Comma-separated debit indicator values for pattern 3 (e.g. "DR,DEBIT"). */
  const [debitValues, setDebitValues] = useState<string>(
    detected.amountPattern?.type === "indicator"
      ? detected.amountPattern.debitValues.join(",")
      : "DR,DEBIT"
  )

  // ── State: live preview ─────────────────────────────────────────
  /** Normalized transactions computed from the current mapping for preview. */
  const [previewRows, setPreviewRows] = useState<NormalizedTransaction[]>([])

  // ── Build current mapping from state ────────────────────────────

  /** Assembles the current AmountPattern from state, or null if incomplete. */
  function buildAmountPattern(): AmountPattern | null {
    switch (patternType) {
      case "single":
        return amountColumn !== null
          ? { type: "single", amountColumn }
          : null
      case "separate":
        return debitColumn !== null && creditColumn !== null
          ? { type: "separate", debitColumn, creditColumn }
          : null
      case "indicator": {
        const parsed = debitValues
          .split(",")
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean)
        return amountColumn !== null && indicatorColumn !== null && parsed.length > 0
          ? { type: "indicator", amountColumn, indicatorColumn, debitValues: parsed }
          : null
      }
    }
  }

  /** Assembles the full ColumnMapping from state, or null if required fields are missing. */
  function buildMapping(): ColumnMapping | null {
    if (dateColumn === null || descriptionColumn === null) return null
    const pattern = buildAmountPattern()
    if (!pattern) return null
    return {
      dateColumn,
      descriptionColumn,
      categoryColumn: categoryColumn ?? undefined,
      amountPattern: pattern,
    }
  }

  const currentMapping = buildMapping()

  // ── Recompute preview when mapping changes ──────────────────────

  useEffect(() => {
    let cancelled = false

    async function computePreview() {
      if (!currentMapping) {
        setPreviewRows([])
        return
      }
      try {
        const preview = await normalizeAmounts(sampleRows.slice(0, 5), currentMapping)
        if (!cancelled) setPreviewRows(preview)
      } catch {
        if (!cancelled) setPreviewRows([])
      }
    }

    computePreview()
    return () => {
      cancelled = true
    }
  }, [
    dateColumn,
    descriptionColumn,
    categoryColumn,
    patternType,
    amountColumn,
    debitColumn,
    creditColumn,
    indicatorColumn,
    debitValues,
    // sampleRows is stable from parent — no need to track deeply
  ])

  // ── Handlers ────────────────────────────────────────────────────

  /** Convert a Select string value to a column index or null. */
  function toColumnIndex(value: string): number | null {
    return value === NONE ? null : parseInt(value, 10)
  }

  /** Handle the Continue button: validate and emit the mapping. */
  function handleConfirm() {
    if (currentMapping) {
      onMappingConfirm(currentMapping)
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Columns className="h-5 w-5" />
          Map Columns
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Amount Pattern Selector ────────────────────────────── */}
        <div className="space-y-2">
          <Label>Amount Pattern</Label>
          <div className="flex flex-wrap gap-2">
            {AMOUNT_PATTERNS.map((p) => (
              <Button
                key={p.value}
                variant={patternType === p.value ? "default" : "outline"}
                onClick={() => setPatternType(p.value)}
                size="sm"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── Common Column Mappings ─────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Date column */}
          <div className="space-y-2">
            <Label htmlFor="date-col">
              Date Column <span className="text-destructive">*</span>
            </Label>
            <Select
              value={dateColumn !== null ? String(dateColumn) : NONE}
              onValueChange={(v) => setDateColumn(toColumnIndex(v))}
            >
              <SelectTrigger id="date-col">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>-- Select --</SelectItem>
                {headers.map((h, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {h || `Column ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description column */}
          <div className="space-y-2">
            <Label htmlFor="desc-col">
              Description Column <span className="text-destructive">*</span>
            </Label>
            <Select
              value={descriptionColumn !== null ? String(descriptionColumn) : NONE}
              onValueChange={(v) => setDescriptionColumn(toColumnIndex(v))}
            >
              <SelectTrigger id="desc-col">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>-- Select --</SelectItem>
                {headers.map((h, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {h || `Column ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category column (optional) */}
          <div className="space-y-2">
            <Label htmlFor="cat-col">Category Column</Label>
            <Select
              value={categoryColumn !== null ? String(categoryColumn) : NONE}
              onValueChange={(v) => setCategoryColumn(toColumnIndex(v))}
            >
              <SelectTrigger id="cat-col">
                <SelectValue placeholder="None (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {headers.map((h, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {h || `Column ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Pattern-Specific Column Mappings ───────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Pattern 1: Single amount column */}
          {patternType === "single" && (
            <div className="space-y-2">
              <Label htmlFor="amount-col">
                Amount Column <span className="text-destructive">*</span>
              </Label>
              <Select
                value={amountColumn !== null ? String(amountColumn) : NONE}
                onValueChange={(v) => setAmountColumn(toColumnIndex(v))}
              >
                <SelectTrigger id="amount-col">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>-- Select --</SelectItem>
                  {headers.map((h, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {h || `Column ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pattern 2: Separate debit/credit columns */}
          {patternType === "separate" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="debit-col">
                  Debit Column <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={debitColumn !== null ? String(debitColumn) : NONE}
                  onValueChange={(v) => setDebitColumn(toColumnIndex(v))}
                >
                  <SelectTrigger id="debit-col">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Select --</SelectItem>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h || `Column ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="credit-col">
                  Credit Column <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={creditColumn !== null ? String(creditColumn) : NONE}
                  onValueChange={(v) => setCreditColumn(toColumnIndex(v))}
                >
                  <SelectTrigger id="credit-col">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Select --</SelectItem>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h || `Column ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Pattern 3: Amount + type indicator */}
          {patternType === "indicator" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ind-amount-col">
                  Amount Column <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={amountColumn !== null ? String(amountColumn) : NONE}
                  onValueChange={(v) => setAmountColumn(toColumnIndex(v))}
                >
                  <SelectTrigger id="ind-amount-col">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Select --</SelectItem>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h || `Column ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="indicator-col">
                  Type Indicator Column <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={indicatorColumn !== null ? String(indicatorColumn) : NONE}
                  onValueChange={(v) => setIndicatorColumn(toColumnIndex(v))}
                >
                  <SelectTrigger id="indicator-col">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Select --</SelectItem>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h || `Column ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-values">
                  Debit Indicator Values <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="debit-values"
                  placeholder="DR,DEBIT"
                  value={debitValues}
                  onChange={(e) => setDebitValues(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated values that indicate a debit (e.g. DR,DEBIT,D)
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Live Preview Table ──────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Preview</Label>
            {previewRows.length > 0 && (
              <Badge variant="secondary">{previewRows.length} rows</Badge>
            )}
          </div>

          {currentMapping === null ? (
            <p className="text-sm text-muted-foreground">
              Select all required columns to see a preview.
            </p>
          ) : previewRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No valid rows found with the current mapping. Check your column selections.
            </p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {row.description}
                      </TableCell>
                      <TableCell>
                        {row.category ? (
                          <Badge variant="outline">{row.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          row.amount >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {formatCurrency(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Action Buttons ──────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={handleConfirm} disabled={currentMapping === null}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
