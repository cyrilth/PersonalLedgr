"use client"

/**
 * Spending breakdown donut chart by category.
 *
 * Shows a Recharts PieChart with category segments and a legend with amounts.
 * Uses the chart color palette from CSS custom properties for theme-aware colors.
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Spending Breakdown — {monthLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          {/* Donut chart */}
          <div className="h-[200px] w-[200px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
                  formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend with amounts */}
          <div className="flex-1 space-y-2">
            {data.map((item, index) => (
              <div key={item.category} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="truncate">{item.category}</span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                  <span className="text-xs text-muted-foreground w-10">
                    {total > 0 ? `${Math.round((item.amount / total) * 100)}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
