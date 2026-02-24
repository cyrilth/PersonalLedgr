"use client"

/**
 * Settings page with 8 Card sections:
 * A. Account & Profile — link to /profile
 * B. Appearance — theme toggle
 * C. Categories — manage built-in + custom categories
 * D. Disclaimer — full disclaimer text
 * E. Tithing — enable/configure tithing tracking
 * F. Recalculate — check/apply balance drift corrections
 * G. Seed Data — load demo data / wipe all data
 * H. Data Export — JSON + CSV download
 */

import { useEffect, useState, useCallback } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { toast } from "sonner"
import {
  User,
  Palette,
  Tag,
  FileWarning,
  Heart,
  Calculator,
  Database,
  Download,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Loader2,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { DisclaimerContent } from "@/components/disclaimer-content"
import { DEFAULT_CATEGORIES } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import {
  getAllUserCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  restoreCategory,
} from "@/actions/categories"
import {
  recalculateAllBalances,
  confirmRecalculateAll,
} from "@/actions/accounts"
import { exportAllDataJSON, exportTransactionsCSV } from "@/actions/export"
import {
  getTithingSettings,
  updateTithingSettings,
  type TithingSettings,
} from "@/actions/settings"

// ── Types ──────────────────────────────────────────────────────────

interface UserCat {
  id: string
  name: string
  isActive: boolean
}

interface DriftRow {
  accountId: string
  name: string
  type: string
  storedBalance: number
  calculatedBalance: number
  drift: number
}

// ── Page Component ─────────────────────────────────────────────────

export default function SettingsPage() {
  const { resolvedTheme } = useTheme()

  // -- Categories state --
  const [customCategories, setCustomCategories] = useState<UserCat[]>([])
  const [newCategoryName, setNewCategoryName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [catLoading, setCatLoading] = useState(false)

  // -- Recalculate state --
  const [driftRows, setDriftRows] = useState<DriftRow[] | null>(null)
  const [recalcLoading, setRecalcLoading] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)

  // -- Seed data state --
  const [seedLoading, setSeedLoading] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeConfirmText, setWipeConfirmText] = useState("")
  const [wipeLoading, setWipeLoading] = useState(false)

  // -- Export state --
  const [exportJsonLoading, setExportJsonLoading] = useState(false)
  const [exportCsvLoading, setExportCsvLoading] = useState(false)

  // -- Tithing state --
  const [tithingSettings, setTithingSettings] = useState<TithingSettings>({
    tithingEnabled: false,
    tithingPercentage: 10,
    tithingExtraMonthly: 0,
    tithingCategory: "Tithe",
  })
  const [tithingLoading, setTithingLoading] = useState(false)
  const [tithingSaving, setTithingSaving] = useState(false)

  // ── Categories ────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    try {
      const data = await getAllUserCategories()
      setCustomCategories(data)
    } catch {
      toast.error("Failed to load categories")
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // ── Tithing ─────────────────────────────────────────────────────────

  const fetchTithingSettings = useCallback(async () => {
    setTithingLoading(true)
    try {
      const data = await getTithingSettings()
      setTithingSettings(data)
    } catch {
      toast.error("Failed to load tithing settings")
    } finally {
      setTithingLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTithingSettings()
  }, [fetchTithingSettings])

  async function handleSaveTithingSettings() {
    setTithingSaving(true)
    try {
      await updateTithingSettings(tithingSettings)
      toast.success("Tithing settings saved")
    } catch {
      toast.error("Failed to save tithing settings")
    } finally {
      setTithingSaving(false)
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return
    setCatLoading(true)
    try {
      await createCategory(newCategoryName.trim())
      setNewCategoryName("")
      toast.success("Category created")
      fetchCategories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create category")
    } finally {
      setCatLoading(false)
    }
  }

  async function handleRenameCategory(id: string) {
    if (!editingName.trim()) return
    setCatLoading(true)
    try {
      await renameCategory(id, editingName.trim())
      setEditingId(null)
      setEditingName("")
      toast.success("Category renamed")
      fetchCategories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename category")
    } finally {
      setCatLoading(false)
    }
  }

  async function handleDeleteCategory(id: string) {
    setCatLoading(true)
    try {
      await deleteCategory(id)
      toast.success("Category removed")
      fetchCategories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category")
    } finally {
      setCatLoading(false)
    }
  }

  async function handleRestoreCategory(id: string) {
    setCatLoading(true)
    try {
      await restoreCategory(id)
      toast.success("Category restored")
      fetchCategories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore category")
    } finally {
      setCatLoading(false)
    }
  }

  // ── Recalculate ───────────────────────────────────────────────────

  async function handleCheckBalances() {
    setRecalcLoading(true)
    try {
      const results = await recalculateAllBalances()
      setDriftRows(results)
      const hasDrift = results.some((r) => r.drift !== 0)
      if (!hasDrift) {
        toast.success("All balances are correct — no drift detected")
      }
    } catch {
      toast.error("Failed to check balances")
    } finally {
      setRecalcLoading(false)
    }
  }

  async function handleApplyCorrections() {
    setApplyLoading(true)
    try {
      const results = await confirmRecalculateAll()
      const corrected = results.filter((r) => r.corrected).length
      toast.success(
        corrected > 0
          ? `Corrected ${corrected} account${corrected !== 1 ? "s" : ""}`
          : "No corrections needed"
      )
      setDriftRows(null)
    } catch {
      toast.error("Failed to apply corrections")
    } finally {
      setApplyLoading(false)
    }
  }

  // ── Seed Data ─────────────────────────────────────────────────────

  async function handleLoadSeedData() {
    setSeedLoading(true)
    try {
      const res = await fetch("/api/seed?action=generate", { method: "POST" })
      if (!res.ok) throw new Error("Failed to load seed data")
      toast.success("Demo data loaded successfully")
    } catch {
      toast.error("Failed to load demo data")
    } finally {
      setSeedLoading(false)
    }
  }

  async function handleWipeData() {
    if (wipeConfirmText !== "DELETE") return
    setWipeLoading(true)
    try {
      const res = await fetch("/api/seed?action=wipe", { method: "POST" })
      if (!res.ok) throw new Error("Failed to wipe data")
      toast.success("All data wiped successfully")
      setWipeOpen(false)
      setWipeConfirmText("")
    } catch {
      toast.error("Failed to wipe data")
    } finally {
      setWipeLoading(false)
    }
  }

  // ── Data Export ───────────────────────────────────────────────────

  async function handleExportJSON() {
    setExportJsonLoading(true)
    try {
      const json = await exportAllDataJSON()
      downloadFile(json, "personalledgr-export.json", "application/json")
      toast.success("JSON export downloaded")
    } catch {
      toast.error("Failed to export JSON")
    } finally {
      setExportJsonLoading(false)
    }
  }

  async function handleExportCSV() {
    setExportCsvLoading(true)
    try {
      const csv = await exportTransactionsCSV()
      downloadFile(csv, "personalledgr-transactions.csv", "text/csv")
      toast.success("CSV export downloaded")
    } catch {
      toast.error("Failed to export CSV")
    } finally {
      setExportCsvLoading(false)
    }
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────

  const activeCustom = customCategories.filter((c) => c.isActive)
  const inactiveCustom = customCategories.filter((c) => !c.isActive)
  const hasDrift = driftRows?.some((r) => r.drift !== 0) ?? false

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* A. Account & Profile */}
      <Card id="account-profile">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account & Profile
          </CardTitle>
          <CardDescription>Manage your name, avatar, and password</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/profile">Go to Profile</Link>
          </Button>
        </CardContent>
      </Card>

      {/* B. Appearance */}
      <Card id="theme">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>Toggle between light and dark mode</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground capitalize">
            {resolvedTheme ?? "system"} mode
          </span>
        </CardContent>
      </Card>

      {/* C. Categories */}
      <Card id="categories">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Categories
          </CardTitle>
          <CardDescription>
            Manage transaction categories. Built-in categories cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Built-in categories */}
          <div>
            <h4 className="mb-2 text-sm font-medium">Built-in Categories</h4>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_CATEGORIES.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>

          {/* Custom categories */}
          <div>
            <h4 className="mb-2 text-sm font-medium">Custom Categories</h4>
            {activeCustom.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom categories yet.</p>
            ) : (
              <div className="space-y-1.5">
                {activeCustom.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2">
                    {editingId === cat.id ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8 w-48"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameCategory(cat.id)
                            if (e.key === "Escape") { setEditingId(null); setEditingName("") }
                          }}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleRenameCategory(cat.id)}
                          disabled={catLoading}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => { setEditingId(null); setEditingName("") }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-xs">
                          {cat.name}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteCategory(cat.id)}
                          disabled={catLoading}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inactive (deleted) categories */}
          {inactiveCustom.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                Removed Categories
              </h4>
              <div className="space-y-1.5">
                {inactiveCustom.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs line-through opacity-60">
                      {cat.name}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleRestoreCategory(cat.id)}
                      disabled={catLoading}
                      title="Restore"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new category */}
          <div className="flex items-center gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name..."
              className="h-8 w-48"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCategory()
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateCategory}
              disabled={catLoading || !newCategoryName.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* D. Disclaimer */}
      <Card id="disclaimer">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5" />
            Disclaimer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DisclaimerContent />
        </CardContent>
      </Card>

      {/* E. Tithing */}
      <Card id="tithing">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Tithing
          </CardTitle>
          <CardDescription>
            Track estimated vs actual tithing based on your income.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="tithing-enabled"
              checked={tithingSettings.tithingEnabled}
              onCheckedChange={(checked) =>
                setTithingSettings((s) => ({ ...s, tithingEnabled: checked }))
              }
              disabled={tithingLoading}
            />
            <Label htmlFor="tithing-enabled">Enable Tithing Tracking</Label>
          </div>

          {tithingSettings.tithingEnabled && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tithing-pct">Percentage (%)</Label>
                  <Input
                    id="tithing-pct"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={tithingSettings.tithingPercentage}
                    onChange={(e) =>
                      setTithingSettings((s) => ({
                        ...s,
                        tithingPercentage: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tithing-extra">Extra Monthly ($)</Label>
                  <Input
                    id="tithing-extra"
                    type="number"
                    step="0.01"
                    min="0"
                    value={tithingSettings.tithingExtraMonthly}
                    onChange={(e) =>
                      setTithingSettings((s) => ({
                        ...s,
                        tithingExtraMonthly: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tithing-cat">Category Name</Label>
                  <Input
                    id="tithing-cat"
                    type="text"
                    value={tithingSettings.tithingCategory}
                    onChange={(e) =>
                      setTithingSettings((s) => ({
                        ...s,
                        tithingCategory: e.target.value,
                      }))
                    }
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveTithingSettings}
                disabled={tithingSaving}
                variant="outline"
              >
                {tithingSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </>
          )}

          {!tithingSettings.tithingEnabled && !tithingLoading && (
            <Button
              onClick={handleSaveTithingSettings}
              disabled={tithingSaving}
              variant="outline"
              size="sm"
            >
              {tithingSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          )}
        </CardContent>
      </Card>

      {/* F. Recalculate Balances */}
      <Card id="recalculate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Recalculate Balances
          </CardTitle>
          <CardDescription>
            Compare stored account balances against the sum of all transactions to detect drift.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleCheckBalances}
            disabled={recalcLoading}
            variant="outline"
          >
            {recalcLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check Balances
          </Button>

          {driftRows && (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Stored</TableHead>
                      <TableHead className="text-right">Calculated</TableHead>
                      <TableHead className="text-right">Drift</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driftRows.map((row) => (
                      <TableRow key={row.accountId}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.storedBalance)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.calculatedBalance)}</TableCell>
                        <TableCell className={`text-right font-medium ${row.drift !== 0 ? "text-red-500" : "text-green-500"}`}>
                          {row.drift !== 0 ? formatCurrency(row.drift) : "OK"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {hasDrift && (
                <Button
                  onClick={handleApplyCorrections}
                  disabled={applyLoading}
                  variant="destructive"
                >
                  {applyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Apply Corrections
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* G. Seed Data */}
      <Card id="seed-data">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Seed Data
          </CardTitle>
          <CardDescription>
            Load demo data for testing or wipe all finance data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={handleLoadSeedData}
            disabled={seedLoading}
            variant="outline"
          >
            {seedLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load Demo Data
          </Button>
          <Button
            onClick={() => setWipeOpen(true)}
            variant="destructive"
          >
            Wipe All Data
          </Button>
        </CardContent>
      </Card>

      {/* Wipe confirmation dialog */}
      <AlertDialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe All Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your finance data including accounts,
              transactions, budgets, recurring bills, and interest logs.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <p className="mb-2 text-sm font-medium">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <Input
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="Type DELETE..."
              className="w-48"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setWipeConfirmText("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWipeData}
              disabled={wipeConfirmText !== "DELETE" || wipeLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {wipeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Wipe Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* H. Data Export */}
      <Card id="data-export">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Data Export
          </CardTitle>
          <CardDescription>
            Download your finance data as JSON (all data) or CSV (transactions only).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={handleExportJSON}
            disabled={exportJsonLoading}
            variant="outline"
          >
            {exportJsonLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Export JSON
          </Button>
          <Button
            onClick={handleExportCSV}
            disabled={exportCsvLoading}
            variant="outline"
          >
            {exportCsvLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Export CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
