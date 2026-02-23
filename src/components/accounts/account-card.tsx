"use client"

/**
 * Clickable account card for the accounts grid.
 *
 * Displays account name, type icon, balance, and owner. Credit cards
 * additionally show a utilization progress bar with color thresholds:
 * green (<30%), yellow (30-70%), red (>70%).
 *
 * Debt account balances (CC/loan/mortgage) are stored as negative in the DB
 * but displayed as positive values here using Math.abs().
 */

import Link from "next/link"
import { Landmark, PiggyBank, CreditCard, HandCoins, Home, RotateCcw, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface AccountCardProps {
  id: string
  name: string
  type: string
  balance: number
  creditLimit: number | null
  owner: string | null
  onReactivate?: (id: string) => void
  onPermanentDelete?: (id: string, name: string) => void
}

/** Maps account type enum to its display icon. */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  CHECKING: Landmark,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  LOAN: HandCoins,
  MORTGAGE: Home,
}

/** Account types whose balances are stored as negative (money owed). */
const DEBT_TYPES = ["CREDIT_CARD", "LOAN", "MORTGAGE"]

/** Get text color class based on utilization percentage thresholds. */
export function getUtilizationColor(pct: number): string {
  if (pct < 30) return "text-positive"
  if (pct < 70) return "text-yellow-500"
  return "text-negative"
}

/** Get progress bar indicator class based on utilization. */
export function getProgressColor(pct: number): string {
  if (pct < 30) return "[&>div]:bg-positive"
  if (pct < 70) return "[&>div]:bg-yellow-500"
  return "[&>div]:bg-negative"
}

export function AccountCard({ id, name, type, balance, creditLimit, owner, onReactivate, onPermanentDelete }: AccountCardProps) {
  const Icon = ICON_MAP[type] || Landmark
  const isDebt = DEBT_TYPES.includes(type)
  const displayBalance = isDebt ? Math.abs(balance) : balance
  const limit = creditLimit ? Number(creditLimit) : 0
  const utilization = type === "CREDIT_CARD" && limit > 0 ? (Math.abs(balance) / limit) * 100 : 0
  const isInactive = !!onReactivate

  const cardContent = (
    <Card className={cn("transition-colors", isInactive ? "opacity-60" : "hover:bg-muted/50")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{name}</p>
              {owner && (
                <p className="text-xs text-muted-foreground">{owner}</p>
              )}
            </div>
          </div>
          <p className={cn("text-sm font-semibold", isDebt && "text-negative")}>
            {formatCurrency(displayBalance)}
          </p>
        </div>

        {type === "CREDIT_CARD" && limit > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(Math.abs(balance))} / {formatCurrency(limit)}</span>
              <span className={getUtilizationColor(utilization)}>
                {utilization.toFixed(0)}%
              </span>
            </div>
            <Progress
              value={Math.min(utilization, 100)}
              className={cn("h-1.5", getProgressColor(utilization))}
            />
          </div>
        )}

        {isInactive && (
          <div className="mt-3 space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onReactivate?.(id)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reactivate
            </Button>
            {onPermanentDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => onPermanentDelete(id, name)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete Permanently
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )

  if (isInactive) return cardContent

  return <Link href={`/accounts/${id}`}>{cardContent}</Link>
}
