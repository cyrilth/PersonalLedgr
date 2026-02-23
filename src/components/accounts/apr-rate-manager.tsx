"use client"

/**
 * APR rates management section for account detail pages.
 *
 * Displays all APR rates (active + expired) with type badges, rate percentages,
 * effective/expiration dates, and transaction counts. Supports add/edit/deactivate.
 */

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getAprRates,
  createAprRate,
  updateAprRate,
  deleteAprRate,
} from "@/actions/apr-rates"
import { APR_RATE_TYPE_LABELS } from "@/lib/constants"
import type { AprRateType } from "@/lib/constants"
import { formatDate } from "@/lib/utils"

type AprRate = Awaited<ReturnType<typeof getAprRates>>[number]

interface AprRateManagerProps {
  accountId: string
}

/** All available APR rate types for the dropdown selector. */
const RATE_TYPES = Object.entries(APR_RATE_TYPE_LABELS) as [AprRateType, string][]

/**
 * Self-contained APR rate management widget for credit card account detail pages.
 *
 * Fetches rates on mount via getAprRates(), displays them in a table with
 * type badges, and provides add/edit/deactivate actions. The form dialog
 * accepts APR as a user-friendly percentage (e.g. "24.99") and converts
 * to decimal (0.2499) before sending to the server action.
 */
export function AprRateManager({ accountId }: AprRateManagerProps) {
  const [rates, setRates] = useState<AprRate[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<AprRate | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [rateType, setRateType] = useState<string>("STANDARD")
  const [apr, setApr] = useState("")
  const [effectiveDate, setEffectiveDate] = useState("")
  const [expirationDate, setExpirationDate] = useState("")
  const [description, setDescription] = useState("")

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAprRates(accountId)
      setRates(data)
    } catch (err) {
      console.error("Failed to load APR rates:", err)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  /** Reset form fields and open the dialog in "add" mode. */
  function openAdd() {
    setEditingRate(null)
    setRateType("STANDARD")
    setApr("")
    setEffectiveDate(new Date().toISOString().split("T")[0])
    setExpirationDate("")
    setDescription("")
    setFormOpen(true)
  }

  /** Pre-fill form fields from existing rate and open in "edit" mode. */
  function openEdit(rate: AprRate) {
    setEditingRate(rate)
    setRateType(rate.rateType)
    setApr(String(rate.apr * 100))
    setEffectiveDate(new Date(rate.effectiveDate).toISOString().split("T")[0])
    setExpirationDate(
      rate.expirationDate
        ? new Date(rate.expirationDate).toISOString().split("T")[0]
        : ""
    )
    setDescription(rate.description || "")
    setFormOpen(true)
  }

  /** Validate and submit — creates or updates depending on editingRate state. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Convert user-entered percentage to decimal fraction (24.99% → 0.2499)
    const parsedApr = parseFloat(apr) / 100
    if (isNaN(parsedApr) || parsedApr < 0) {
      toast.error("APR must be zero or a positive number")
      return
    }
    if (!effectiveDate) {
      toast.error("Effective date is required")
      return
    }

    setSaving(true)
    try {
      if (editingRate) {
        await updateAprRate(editingRate.id, {
          rateType,
          apr: parsedApr,
          effectiveDate,
          expirationDate: expirationDate || null,
          description,
        })
        toast.success("APR rate updated")
      } else {
        await createAprRate({
          accountId,
          rateType,
          apr: parsedApr,
          effectiveDate,
          expirationDate: expirationDate || null,
          description,
        })
        toast.success("APR rate added")
      }
      setFormOpen(false)
      fetchRates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save APR rate")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  /** Soft-delete a rate after user confirmation. */
  async function handleDeactivate(rate: AprRate) {
    if (!confirm(`Deactivate ${APR_RATE_TYPE_LABELS[rate.rateType as AprRateType]} rate?`)) return
    try {
      await deleteAprRate(rate.id)
      toast.success("APR rate deactivated")
      fetchRates()
    } catch (err) {
      toast.error("Failed to deactivate rate")
      console.error(err)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            APR Rates
          </CardTitle>
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Rate
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No APR rates configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Rate</th>
                    <th className="pb-2 pr-4 font-medium">Effective</th>
                    <th className="pb-2 pr-4 font-medium">Expiration</th>
                    <th className="pb-2 pr-4 font-medium">Transactions</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rates.map((rate) => (
                    <tr key={rate.id} className={!rate.isActive ? "opacity-50" : ""}>
                      <td className="py-2 pr-4">
                        <Badge variant={rate.isActive ? "outline" : "secondary"}>
                          {APR_RATE_TYPE_LABELS[rate.rateType as AprRateType]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {(rate.apr * 100).toFixed(2)}%
                      </td>
                      <td className="py-2 pr-4">{formatDate(rate.effectiveDate)}</td>
                      <td className="py-2 pr-4">
                        {rate.expirationDate ? formatDate(rate.expirationDate) : "—"}
                      </td>
                      <td className="py-2 pr-4">{rate.transactionCount}</td>
                      <td className="py-2">
                        {rate.isActive && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(rate)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeactivate(rate)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRate ? "Edit APR Rate" : "Add APR Rate"}</DialogTitle>
            <DialogDescription>
              {editingRate
                ? "Update the rate details below."
                : "Add a new APR rate to this credit card."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rate-type">Rate Type</Label>
              <Select value={rateType} onValueChange={setRateType}>
                <SelectTrigger id="rate-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apr-value">APR (%)</Label>
              <Input
                id="apr-value"
                type="number"
                step="0.01"
                min="0"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                placeholder="24.99"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="effective-date">Effective Date</Label>
              <Input
                id="effective-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiration-date">Expiration Date (optional)</Label>
              <Input
                id="expiration-date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-description">Description (optional)</Label>
              <Input
                id="rate-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 0% intro on Best Buy purchase"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingRate ? "Update" : "Add Rate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
