"use client"

/**
 * Add/edit recurring bill dialog form.
 *
 * Renders a Dialog with form fields for creating or editing a recurring bill.
 * In create mode, all fields start empty and the form calls createRecurringBill.
 * In edit mode, fields are pre-filled from editData and the form calls
 * updateRecurringBill.
 *
 * Follows the same dialog pattern as LoanForm: controlled open/onOpenChange
 * props, onSuccess callback, toast notifications, and form reset on open/close.
 */

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { RECURRING_FREQUENCY_LABELS } from "@/lib/constants"
import type { RecurringFrequency } from "@/lib/constants"
import { createRecurringBill, updateRecurringBill } from "@/actions/recurring"

interface BillFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editData?: {
    id: string
    name: string
    amount: number
    frequency: string
    dayOfMonth: number
    isVariableAmount: boolean
    category: string | null
    accountId: string
  } | null
  accounts: { id: string; name: string }[]
  categories?: string[]
}

export function BillForm({
  open,
  onOpenChange,
  onSuccess,
  editData,
  accounts,
  categories = [],
}: BillFormProps) {
  const isEdit = !!editData

  // -- Form state --
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [frequency, setFrequency] = useState<RecurringFrequency>("MONTHLY")
  const [dayOfMonth, setDayOfMonth] = useState("")
  const [isVariableAmount, setIsVariableAmount] = useState(false)
  const [category, setCategory] = useState("")
  const [accountId, setAccountId] = useState("")
  const [saving, setSaving] = useState(false)

  /**
   * Resets form fields when the dialog opens or editData changes.
   * In edit mode, pre-fills all fields from editData.
   * In create mode, resets to empty defaults.
   */
  useEffect(() => {
    if (open) {
      if (editData) {
        setName(editData.name)
        setAmount(editData.amount.toString())
        setFrequency(editData.frequency as RecurringFrequency)
        setDayOfMonth(editData.dayOfMonth.toString())
        setIsVariableAmount(editData.isVariableAmount)
        setCategory(editData.category ?? "")
        setAccountId(editData.accountId)
      } else {
        setName("")
        setAmount("")
        setFrequency("MONTHLY")
        setDayOfMonth("")
        setIsVariableAmount(false)
        setCategory("")
        setAccountId("")
      }
    }
  }, [open, editData])

  /** Handles form submission for both create and edit modes. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Bill name is required")
      return
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be a positive number")
      return
    }

    const parsedDay = parseInt(dayOfMonth)
    if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      toast.error("Day of month must be between 1 and 31")
      return
    }

    if (!accountId) {
      toast.error("Payment account is required")
      return
    }

    setSaving(true)
    try {
      if (isEdit && editData) {
        await updateRecurringBill(editData.id, {
          name: name.trim(),
          amount: parsedAmount,
          frequency,
          dayOfMonth: parsedDay,
          isVariableAmount,
          category: category.trim() || undefined,
          accountId,
        })
        toast.success("Recurring bill updated")
      } else {
        await createRecurringBill({
          name: name.trim(),
          amount: parsedAmount,
          frequency,
          dayOfMonth: parsedDay,
          isVariableAmount,
          category: category.trim() || undefined,
          accountId,
        })
        toast.success("Recurring bill created")
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Recurring Bill" : "Add Recurring Bill"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of this recurring bill."
              : "Set up a new recurring bill to track."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="bill-name">Name</Label>
            <Input
              id="bill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Electric Bill"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="bill-amount">
              {isVariableAmount ? "Estimated Amount" : "Amount"}
            </Label>
            <Input
              id="bill-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 150.00"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label htmlFor="bill-frequency">Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as RecurringFrequency)}
            >
              <SelectTrigger id="bill-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RECURRING_FREQUENCY_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Day of Month */}
          <div className="space-y-2">
            <Label htmlFor="bill-day">Day of Month</Label>
            <Input
              id="bill-day"
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              placeholder="e.g. 15"
            />
          </div>

          {/* Variable Amount Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="bill-variable">Variable amount</Label>
              <p className="text-muted-foreground text-xs">
                Bill amount varies each period
              </p>
            </div>
            <Switch
              id="bill-variable"
              checked={isVariableAmount}
              onCheckedChange={setIsVariableAmount}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="bill-category">Category (optional)</Label>
            <Select
              value={category}
              onValueChange={setCategory}
            >
              <SelectTrigger id="bill-category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Account */}
          <div className="space-y-2">
            <Label htmlFor="bill-account">Payment Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="bill-account" className="w-full">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acct) => (
                  <SelectItem key={acct.id} value={acct.id}>
                    {acct.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create Bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
