"use client"

/**
 * Card component for displaying a recurring bill summary.
 *
 * Shows bill name, frequency, amount (with estimated prefix for variable bills),
 * payment details, next due date with countdown, and edit/delete action buttons.
 */

import { Pencil, Trash2, Calendar, CreditCard, Tag } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { RECURRING_FREQUENCY_LABELS } from "@/lib/constants"
import type { RecurringFrequency } from "@/lib/constants"

interface BillCardProps {
  id: string
  name: string
  amount: number
  frequency: string
  dayOfMonth: number
  isVariableAmount: boolean
  category: string | null
  nextDueDate: Date
  account: { id: string; name: string }
  onEdit?: () => void
  onDelete?: () => void
}

/** Return the ordinal suffix for a day number (1st, 2nd, 3rd, 4th, etc.). */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Calculate the number of full days between now and a target date. */
function daysUntil(target: Date): number {
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function BillCard({
  name,
  amount,
  frequency,
  dayOfMonth,
  isVariableAmount,
  category,
  nextDueDate,
  account,
  onEdit,
  onDelete,
}: BillCardProps) {
  const days = daysUntil(nextDueDate)
  const frequencyLabel =
    RECURRING_FREQUENCY_LABELS[frequency as RecurringFrequency] ?? frequency

  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold truncate">{name}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="text-xs">
              {frequencyLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                isVariableAmount &&
                  "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              )}
            >
              {isVariableAmount ? "Variable (estimated)" : "Fixed"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {/* Amount */}
        <p className="text-lg font-semibold">
          {isVariableAmount ? "~" : ""}
          {formatCurrency(amount)}
        </p>

        {/* Detail rows */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Due on the {ordinal(dayOfMonth)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{account.name}</span>
          </div>
          {category && (
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span>{category}</span>
            </div>
          )}
        </div>

        {/* Next due date */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Next due: {formatDate(nextDueDate)}
          </span>
          <span
            className={cn(
              "font-medium",
              days <= 3
                ? "text-negative"
                : days <= 7
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
            )}
          >
            {days <= 0 ? "Due today" : days === 1 ? "1 day away" : `${days} days away`}
          </span>
        </div>

        {/* Action buttons */}
        {(onEdit || onDelete) && (
          <div className="flex items-center justify-end gap-1 pt-1 border-t">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Edit</span>
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Delete</span>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
