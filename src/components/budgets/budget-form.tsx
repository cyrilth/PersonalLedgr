"use client"

/**
 * Add/edit budget dialog form.
 *
 * Renders a Dialog with form fields for creating or editing a budget entry.
 * In create mode, the user selects a category and enters a monthly limit.
 * In edit mode, the category selector is disabled and the limit is pre-filled.
 *
 * On submit, calls createBudget() or updateBudget() server actions.
 * Follows the same dialog pattern as LoanForm: controlled open/onOpenChange
 * props, onSuccess callback, and toast notifications for success/error.
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
import { createBudget, updateBudget } from "@/actions/budgets"

interface BudgetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  period: string // Current period "YYYY-MM"
  editData?: {
    id: string
    category: string
    limit: number
  } | null
  categories?: string[]
}

export function BudgetForm({ open, onOpenChange, onSuccess, period, editData, categories = [] }: BudgetFormProps) {
  const isEdit = !!editData

  // -- Form state --
  const [category, setCategory] = useState("")
  const [limit, setLimit] = useState("")
  const [saving, setSaving] = useState(false)

  /**
   * Resets form fields when the dialog opens or editData changes.
   * In edit mode, pre-fills fields from editData.
   * In create mode, resets to defaults.
   */
  useEffect(() => {
    if (open) {
      if (editData) {
        setCategory(editData.category)
        setLimit(editData.limit.toString())
      } else {
        setCategory("")
        setLimit("")
      }
    }
  }, [open, editData])

  /** Handles form submission for both create and edit modes. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsedLimit = parseFloat(limit)
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      toast.error("Please enter a valid monthly limit")
      return
    }

    if (!isEdit && !category) {
      toast.error("Please select a category")
      return
    }

    setSaving(true)
    try {
      if (isEdit && editData) {
        await updateBudget(editData.id, { limit: parsedLimit })
        toast.success("Budget updated")
      } else {
        await createBudget({ category, period, limit: parsedLimit })
        toast.success("Budget created")
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(isEdit ? "Failed to update budget" : "Failed to create budget")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Budget" : "Add Budget"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the monthly limit for this budget."
              : "Set a monthly spending limit for a category."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="budget-category">Category</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={isEdit}
            >
              <SelectTrigger id="budget-category" className="w-full">
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

          {/* Monthly Limit */}
          <div className="space-y-2">
            <Label htmlFor="budget-limit">Monthly Limit</Label>
            <Input
              id="budget-limit"
              type="number"
              step="0.01"
              min="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 500.00"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
