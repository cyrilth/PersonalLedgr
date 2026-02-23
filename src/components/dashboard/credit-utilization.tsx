"use client"

/**
 * Credit card utilization card.
 *
 * Shows a progress bar for each credit card with color coding:
 * - Green: utilization < 30%
 * - Orange: 30-70%
 * - Red: > 70%
 * Includes balance, limit, and owner name.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatCurrency } from "@/lib/utils"

interface CreditCard {
  id: string
  name: string
  balance: number
  limit: number
  utilization: number
  owner: string | null
}

interface CreditUtilizationProps {
  cards: CreditCard[]
}

/** Get color class based on utilization percentage thresholds. */
function getUtilizationColor(pct: number): string {
  if (pct < 30) return "text-positive"
  if (pct < 70) return "text-yellow-500"
  return "text-negative"
}

/** Get progress bar indicator class based on utilization. */
function getProgressColor(pct: number): string {
  if (pct < 30) return "[&>div]:bg-positive"
  if (pct < 70) return "[&>div]:bg-yellow-500"
  return "[&>div]:bg-negative"
}

export function CreditUtilization({ cards }: CreditUtilizationProps) {
  if (cards.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Credit Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No credit cards.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Credit Utilization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cards.map((card) => (
          <div key={card.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{card.name}</span>
                {card.owner && (
                  <span className="text-xs text-muted-foreground">({card.owner})</span>
                )}
              </div>
              <span className={`font-medium ${getUtilizationColor(card.utilization)}`}>
                {card.utilization.toFixed(0)}%
              </span>
            </div>
            <Progress
              value={Math.min(card.utilization, 100)}
              className={`h-2 ${getProgressColor(card.utilization)}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(card.balance)} used</span>
              <span>{formatCurrency(card.limit)} limit</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
