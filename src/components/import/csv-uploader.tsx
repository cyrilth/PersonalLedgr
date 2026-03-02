"use client"

/**
 * CSV file uploader component for the import wizard.
 *
 * Provides drag-and-drop and file picker upload for CSV files, parses them
 * via the `parseCSV` server action, and displays a preview of the first 5 rows.
 * Also includes a target account selector so the user can choose which account
 * the imported transactions will be applied to.
 *
 * Features:
 * - Drag & drop with visual feedback on hover
 * - File picker restricted to .csv files
 * - File name and size display after upload
 * - Remove file to start over
 * - Preview table showing the first 5 data rows
 * - Account selector dropdown
 */

import { useState, useRef, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { Upload, FileText, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { parseCSV } from "@/actions/import"

interface CSVUploaderProps {
  accounts: { id: string; name: string; type: string }[]
  onFileLoaded: (data: { headers: string[]; rows: string[][]; fileName: string }) => void
  onAccountSelect: (accountId: string) => void
  selectedAccountId: string | null
}

/** Format bytes into a human-readable file size string. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * CSV uploader with drag-and-drop support, file preview, and account selection.
 *
 * Parses uploaded CSV files using the server-side `parseCSV` action and
 * displays a preview of the first 5 rows. The parent component receives
 * parsed headers and rows via the `onFileLoaded` callback.
 */
export function CSVUploader({
  accounts,
  onFileLoaded,
  onAccountSelect,
  selectedAccountId,
}: CSVUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [allPreviewRows, setAllPreviewRows] = useState<string[][]>([])
  const [previewPage, setPreviewPage] = useState(0)
  const previewPageSize = 10
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewRows = useMemo(
    () => allPreviewRows.slice(previewPage * previewPageSize, (previewPage + 1) * previewPageSize),
    [allPreviewRows, previewPage]
  )
  const previewTotalPages = Math.ceil(allPreviewRows.length / previewPageSize)

  /** Read and parse a CSV file, then update state and notify parent. */
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        toast.error("Please upload a CSV file (.csv)")
        return
      }

      setIsLoading(true)
      try {
        const content = await file.text()
        const result = await parseCSV(content)

        setFileName(file.name)
        setFileSize(file.size)
        setPreviewHeaders(result.headers)
        setAllPreviewRows(result.rows)
        setPreviewPage(0)

        onFileLoaded({
          headers: result.headers,
          rows: result.rows,
          fileName: file.name,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to parse CSV file"
        toast.error(message)
      } finally {
        setIsLoading(false)
      }
    },
    [onFileLoaded]
  )

  /** Clear the loaded file and reset state. */
  const handleRemoveFile = useCallback(() => {
    setFileName(null)
    setFileSize(null)
    setPreviewHeaders([])
    setAllPreviewRows([])
    setPreviewPage(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <div className="space-y-6">
      {/* Account selector */}
      <Card>
        <CardHeader>
          <CardTitle>Target Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedAccountId ?? ""}
            onValueChange={onAccountSelect}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an account to import into" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Sample CSV format guide */}
      <Card>
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between p-6 [&::-webkit-details-marker]:hidden list-none">
            <CardTitle>Sample CSV Format</CardTitle>
            <span className="text-muted-foreground text-sm group-open:hidden">Show examples</span>
            <span className="text-muted-foreground text-sm hidden group-open:inline">Hide examples</span>
          </summary>
          <CardContent className="pt-0 space-y-5">
            <p className="text-sm text-muted-foreground">
              Your CSV should include columns for date, description, and amount. Below are examples for common account types.
            </p>

            {/* Checking / Savings — signed amount */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Checking / Savings (signed amount)</h4>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>2026-01-15</TableCell>
                      <TableCell>Payroll Deposit</TableCell>
                      <TableCell className="text-emerald-600 dark:text-emerald-400">3500.00</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>2026-01-16</TableCell>
                      <TableCell>Grocery Store</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400">-85.42</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>2026-01-17</TableCell>
                      <TableCell>Electric Bill</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400">-120.00</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Credit Card — separate debit/credit */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Credit Card (separate debit/credit columns)</h4>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>01/20/2026</TableCell>
                      <TableCell>Amazon Purchase</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400">49.99</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>01/22/2026</TableCell>
                      <TableCell>Restaurant</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400">32.50</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>01/25/2026</TableCell>
                      <TableCell>Payment - Thank You</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-emerald-600 dark:text-emerald-400">500.00</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Amount + type indicator */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Amount + type indicator column</h4>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>2026-01-10</TableCell>
                      <TableCell>Transfer from Savings</TableCell>
                      <TableCell>200.00</TableCell>
                      <TableCell>Credit</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>2026-01-12</TableCell>
                      <TableCell>Gas Station</TableCell>
                      <TableCell>45.00</TableCell>
                      <TableCell>Debit</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Date formats like YYYY-MM-DD, MM/DD/YYYY, and DD/MM/YYYY are auto-detected. Column names are matched automatically in the next step.
            </p>
          </CardContent>
        </details>
      </Card>

      {/* File upload area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent>
          {fileName ? (
            /* File loaded state */
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-medium">{fileName}</p>
                  {fileSize !== null && (
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(fileSize)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveFile}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            /* Drag & drop area */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors ${
                isDragOver
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-muted-foreground/30 hover:border-emerald-500/50 hover:bg-muted/50"
              }`}
            >
              <Upload
                className={`h-10 w-10 ${
                  isDragOver
                    ? "text-emerald-500"
                    : "text-muted-foreground"
                }`}
              />
              <div className="text-center">
                <p className="font-medium">
                  {isLoading ? "Parsing file..." : "Drop your CSV file here"}
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview table */}
      {previewHeaders.length > 0 && allPreviewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Preview{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({allPreviewRows.length} total rows)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewHeaders.map((header, i) => (
                      <TableHead key={i}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {previewHeaders.map((_, colIndex) => (
                        <TableCell key={colIndex} className="max-w-[200px] truncate">
                          {row[colIndex] ?? ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {previewTotalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Showing {previewPage * previewPageSize + 1}–{Math.min((previewPage + 1) * previewPageSize, allPreviewRows.length)} of {allPreviewRows.length} rows
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewPage((p) => p - 1)}
                    disabled={previewPage === 0}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground">
                    Page {previewPage + 1} of {previewTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewPage((p) => p + 1)}
                    disabled={previewPage >= previewTotalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
