"use client"

/**
 * Spending breakdown donut chart by category.
 *
 * Shows a Recharts PieChart with category segments and a legend with amounts.
 * Uses the chart color palette from CSS custom properties for theme-aware colors.
 */

import { PieChart, Pie, Cell, Tooltip, type TooltipProps } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface CategoryData {
  category: string
  amount: number
}

interface SpendingBreakdownProps {
  data: CategoryData[]
  monthLabel: string
}

/** Custom tooltip rendered as themed HTML so text is always readable. */
function PieTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-lg border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-md">
      <span className="font-medium">{name}</span>
      <span className="ml-2">{formatCurrency(value ?? 0)}</span>
    </div>
  )
}

// Cycle through chart palette colors for pie segments
const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

export function SpendingBreakdown({ data, monthLabel }: SpendingBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.amount, 0)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Spending Breakdown — {monthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No spending data for this month.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Spending Breakdown — {monthLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          {/* Donut chart */}
          <div className="flex-shrink-0">
              <PieChart width={200} height={200}>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="amount"
                  nameKey="category"
                  strokeWidth={2}
                  className="stroke-card"
                >
                  {data.map((_, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<PieTooltip />}
                  wrapperStyle={{ zIndex: 10 }}
                />
              </PieChart>
          </div>

          {/* Legend with amounts */}
          <div className="min-w-0 flex-1 space-y-2">
            {data.map((item, index) => (
              <div key={item.category} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="truncate">{item.category}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-right">
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                  <span className="text-xs text-muted-foreground w-10">
                    {total > 0 ? `${Math.round((item.amount / total) * 100)}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span className="flex-shrink-0">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
