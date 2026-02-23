"use client"

/**
 * Budget progress bar component.
 *
 * Displays a single budget category as a horizontal card-like row with a
 * color-coded progress bar (green < 80%, amber 80-100%, red > 100%),
 * amount summary, remaining/overage indicator, and edit/delete actions.
 */

import { Pencil, Trash2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { formatCurrency, cn } from "@/lib/utils"

interface BudgetBarProps {
  id: string
  category: string
  limit: number
  actual: number
  remaining: number
  percentUsed: number
  onEdit?: () => void
  onDelete?: () => void
}

/** Get progress bar indicator color class based on budget utilization. */
function getBarColor(percent: number): string {
  if (percent > 100) return "[&>div]:bg-red-500"
  if (percent >= 80) return "[&>div]:bg-amber-500"
  return "[&>div]:bg-emerald-500"
}

export function BudgetBar({
  category,
  limit,
  actual,
  remaining,
  percentUsed,
  onEdit,
  onDelete,
}: BudgetBarProps) {
  const isOver = remaining < 0

  return (
    <div className="rounded-lg border p-4 space-y-2">
      {/* Header row: category name + amounts + actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{category}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {formatCurrency(actual)}{" "}
              <span className="text-xs">/ {formatCurrency(limit)}</span>
            </p>
            <p
              className={cn(
                "text-xs font-medium",
                isOver ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {isOver
                ? `Over by ${formatCurrency(Math.abs(remaining))}`
                : `Remaining: ${formatCurrency(remaining)}`}
            </p>
          </div>

          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onEdit}
                  aria-label={`Edit ${category} budget`}
                >
                  <Pencil />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDelete}
                  aria-label={`Delete ${category} budget`}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <Progress
        value={Math.min(percentUsed, 100)}
        className={cn("h-2", getBarColor(percentUsed))}
      />
    </div>
  )
}
