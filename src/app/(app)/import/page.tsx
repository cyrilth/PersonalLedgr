"use client"

/**
 * CSV Import page — step wizard: Upload → Map Columns → Preview & Review → Confirm.
 *
 * Orchestrates the import flow by managing wizard state and data between the three
 * child components: CSVUploader, ColumnMapper, and ImportPreview.
 *
 * Layout:
 * - Header with title and step indicator
 * - Step 1: Upload CSV file + select target account
 * - Step 2: Map CSV columns to transaction fields (auto-detected + manual override)
 * - Step 3: Preview normalized transactions with duplicate detection, confirm import
 *
 * Follows the same client-side data-fetching pattern as other pages:
 * useState + useEffect + useCallback for fetch, toast for notifications.
 */

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ArrowRight, FileSpreadsheet, Upload, Columns, CheckCircle } from "lucide-react"
import { getAccountsFlat } from "@/actions/accounts"
import {
  detectColumns,
  detectDuplicates,
  importTransactions,
  importAndReconcile,
  type CSVRow,
  type ColumnMapping,
  type DetectedColumns,
  type ImportRow,
  type NormalizedTransaction,
  type ReconcileMatch,
} from "@/actions/import"
import { normalizeAmounts } from "@/actions/import"
import { CSVUploader } from "@/components/import/csv-uploader"
import { ColumnMapper } from "@/components/import/column-mapper"
import { ImportPreview } from "@/components/import/import-preview"
import { formatCurrency } from "@/lib/utils"

// ── Step Indicator ──────────────────────────────────────────────────

/** Wizard step metadata for the progress indicator. */
const STEPS = [
  { label: "Upload", icon: Upload },
  { label: "Map Columns", icon: Columns },
  { label: "Review & Import", icon: CheckCircle },
] as const

/** Displays the current wizard step with numbered circles and connecting lines. */
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i <= currentStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={`hidden text-sm sm:inline ${
              i <= currentStep ? "font-medium" : "text-muted-foreground"
            }`}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={`h-px w-6 ${
                i < currentStep ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page Component ──────────────────────────────────────────────────

export default function ImportPage() {
  // ── Wizard state ────────────────────────────────────────────────
  const [step, setStep] = useState(0)

  // ── Account data ────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string }[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // ── CSV data ────────────────────────────────────────────────────
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<CSVRow[]>([])
  const [fileLoaded, setFileLoaded] = useState(false)

  // ── Column mapping ──────────────────────────────────────────────
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumns | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null)

  // ── Import preview ──────────────────────────────────────────────
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importComplete, setImportComplete] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    reconciled: number
    newBalance: number
  } | null>(null)

  // ── Load accounts on mount ──────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    try {
      const data = await getAccountsFlat()
      setAccounts(
        data.map((a: { id: string; name: string; type: string }) => ({
          id: a.id,
          name: a.name,
          type: a.type,
        }))
      )
    } catch {
      toast.error("Failed to load accounts")
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // ── Step 1: File loaded handler ─────────────────────────────────
  function handleFileLoaded(data: { headers: string[]; rows: string[][]; fileName: string }) {
    setCsvHeaders(data.headers)
    setCsvRows(data.rows)
    setFileLoaded(true)
    // Reset downstream state
    setDetectedColumns(null)
    setColumnMapping(null)
    setImportRows([])
    setImportComplete(false)
    setImportResult(null)
  }

  /** Proceed from step 1 to step 2 — auto-detect columns. */
  async function handleContinueToMapping() {
    if (!fileLoaded || !selectedAccountId) {
      toast.error("Please upload a CSV file and select an account")
      return
    }

    try {
      const detected = await detectColumns(csvHeaders, csvRows.slice(0, 10))
      setDetectedColumns(detected)
      setStep(1)
    } catch {
      toast.error("Failed to detect column mappings")
    }
  }

  // ── Step 2: Mapping confirmed handler ───────────────────────────
  async function handleMappingConfirm(mapping: ColumnMapping) {
    setColumnMapping(mapping)

    try {
      // Normalize all rows
      const normalized = await normalizeAmounts(csvRows, mapping)

      if (normalized.length === 0) {
        toast.error("No valid transactions found with the current mapping")
        return
      }

      // Run duplicate detection
      const rows = await detectDuplicates(normalized, selectedAccountId!)
      setImportRows(rows)
      setStep(2)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process transactions"
      toast.error(message)
    }
  }

  // ── Step 3: Import handlers ─────────────────────────────────────
  function handleRowToggle(index: number) {
    setImportRows((prev) =>
      prev.map((row) =>
        row.index === index ? { ...row, selected: !row.selected } : row
      )
    )
  }

  function handleSelectAll() {
    setImportRows((prev) => prev.map((row) => ({ ...row, selected: true })))
  }

  function handleDeselectAll() {
    setImportRows((prev) => prev.map((row) => ({ ...row, selected: false })))
  }

  function handleDismissReconcile(index: number) {
    setImportRows((prev) =>
      prev.map((row) =>
        row.index === index
          ? { ...row, status: "new" as ImportRow["status"], reconcileMatch: undefined }
          : row
      )
    )
  }

  function handleSelectCandidate(index: number, candidate: ReconcileMatch) {
    setImportRows((prev) =>
      prev.map((row) =>
        row.index === index ? { ...row, reconcileMatch: candidate } : row
      )
    )
  }

  async function handleImport() {
    const selected = importRows.filter((r) => r.selected)
    if (selected.length === 0) {
      toast.error("No transactions selected")
      return
    }

    // Validate no two reconcile rows use the same target transaction
    const reconcileSelected = selected.filter((r) => r.status === "reconcile" && r.reconcileMatch)
    const reconcileTxIds = reconcileSelected.map((r) => r.reconcileMatch!.transactionId)
    if (new Set(reconcileTxIds).size !== reconcileTxIds.length) {
      toast.error("Two or more rows are matched to the same payment. Please resolve before importing.")
      return
    }

    setImporting(true)
    try {
      const newRows = selected.filter((r) => r.status !== "reconcile")
      const reconcileRows = reconcileSelected

      const hasReconcile = reconcileRows.length > 0

      if (hasReconcile) {
        const newTransactions: NormalizedTransaction[] = newRows.map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: r.category,
        }))
        const reconcileItems = reconcileRows.map((r) => ({
          transaction: {
            date: r.date,
            description: r.description,
            amount: r.amount,
            category: r.category,
          },
          reconcileMatch: r.reconcileMatch!,
        }))

        const result = await importAndReconcile(newTransactions, reconcileItems, selectedAccountId!)
        setImportResult({
          imported: result.imported,
          reconciled: result.reconciled,
          newBalance: result.newBalance,
        })
        setImportComplete(true)

        const parts: string[] = []
        if (result.imported > 0) parts.push(`${result.imported} imported`)
        if (result.reconciled > 0) parts.push(`${result.reconciled} reconciled`)
        toast.success(`Successfully ${parts.join(", ")}`)
      } else {
        const transactions: NormalizedTransaction[] = selected.map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: r.category,
        }))

        const result = await importTransactions(transactions, selectedAccountId!)
        setImportResult({
          imported: result.imported,
          reconciled: 0,
          newBalance: result.newBalance,
        })
        setImportComplete(true)
        toast.success(`Successfully imported ${result.imported} transaction${result.imported !== 1 ? "s" : ""}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed"
      toast.error(message)
    } finally {
      setImporting(false)
    }
  }

  /** Reset the wizard to start a new import. */
  function handleStartOver() {
    setStep(0)
    setCsvHeaders([])
    setCsvRows([])
    setFileLoaded(false)
    setSelectedAccountId(null)
    setDetectedColumns(null)
    setColumnMapping(null)
    setImportRows([])
    setImportComplete(false)
    setImportResult(null)
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">CSV Import</h1>
        <StepIndicator currentStep={step} />
      </div>

      {/* Import complete state */}
      {importComplete && importResult ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-12">
          <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Import Complete</h2>
          <p className="text-muted-foreground text-center mb-1">
            Successfully imported {importResult.imported} transaction
            {importResult.imported !== 1 ? "s" : ""}
            {importResult.reconciled > 0 && (
              <> and reconciled {importResult.reconciled} bill payment
              {importResult.reconciled !== 1 ? "s" : ""}</>
            )}.
          </p>
          <p className="text-muted-foreground text-center mb-6">
            New account balance: {formatCurrency(importResult.newBalance)}
          </p>
          <Button onClick={handleStartOver} variant="outline">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import Another File
          </Button>
        </div>
      ) : (
        <>
          {/* Step 1: Upload */}
          {step === 0 && (
            <>
              <CSVUploader
                accounts={accounts}
                onFileLoaded={handleFileLoaded}
                onAccountSelect={setSelectedAccountId}
                selectedAccountId={selectedAccountId}
              />
              {fileLoaded && selectedAccountId && (
                <div className="flex justify-end">
                  <Button onClick={handleContinueToMapping}>
                    Continue to Column Mapping
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Step 2: Map Columns */}
          {step === 1 && detectedColumns && (
            <ColumnMapper
              headers={csvHeaders}
              sampleRows={csvRows.slice(0, 10)}
              detected={detectedColumns}
              accountType={accounts.find((a) => a.id === selectedAccountId)?.type ?? ""}
              onMappingConfirm={handleMappingConfirm}
              onBack={() => setStep(0)}
            />
          )}

          {/* Step 3: Review & Import */}
          {step === 2 && (
            <ImportPreview
              rows={importRows}
              onRowToggle={handleRowToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onDismissReconcile={handleDismissReconcile}
              onSelectCandidate={handleSelectCandidate}
              onImport={handleImport}
              onBack={() => setStep(1)}
              importing={importing}
            />
          )}
        </>
      )}
    </div>
  )
}
