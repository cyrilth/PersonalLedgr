"use client"

/**
 * Net worth summary card.
 *
 * Displays total net worth with a trend arrow (up/down vs last month),
 * and a breakdown of total assets vs total liabilities.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface NetWorthCardProps {
  netWorth: number
  assets: number
  liabilities: number
  change: number
}

export function NetWorthCard({ netWorth, assets, liabilities, change }: NetWorthCardProps) {
  const isPositive = change > 0
  const isNegative = change < 0

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Net Worth
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-3xl font-bold">{formatCurrency(netWorth)}</span>
          {/* Trend indicator */}
          <span
            className={`flex items-center gap-1 text-sm font-medium ${
              isPositive
                ? "text-positive"
                : isNegative
                  ? "text-negative"
                  : "text-muted-foreground"
            }`}
          >
            {isPositive && <TrendingUp className="h-4 w-4" />}
            {isNegative && <TrendingDown className="h-4 w-4" />}
            {!isPositive && !isNegative && <Minus className="h-4 w-4" />}
            {formatCurrency(Math.abs(change))}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">vs last month</p>

        {/* Assets / Liabilities breakdown */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Assets</p>
            <p className="text-lg font-semibold text-positive">
              {formatCurrency(assets)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Liabilities</p>
            <p className="text-lg font-semibold text-negative">
              {formatCurrency(Math.abs(liabilities))}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
