"use client"

/**
 * Monthly income vs expense bar chart.
 *
 * Shows a Recharts BarChart with income (green) and expense (red) bars
 * for each month. Uses CSS custom properties for theme-aware colors.
 */

import { useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChartTooltip } from "@/components/ui/chart-tooltip"

interface MonthData {
  month: string
  income: number
  expense: number
}

interface IncomeExpenseChartProps {
  data: MonthData[]
}

/** Convert "2026-01" to "Jan" for chart axis labels. */
function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-")
  const date = new Date(Number(year), Number(m) - 1)
  return date.toLocaleDateString("en-US", { month: "short" })
}

/** Format dollar amounts for tooltip display. */
function formatDollar(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function IncomeExpenseChart({ data }: IncomeExpenseChartProps) {
  const [monthCount, setMonthCount] = useState<6 | 12>(6)

  // Slice to show last N months that have data
  const displayData = data.slice(-monthCount)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Income vs Expenses
        </CardTitle>
        <div className="flex gap-1">
          <Button
            variant={monthCount === 6 ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setMonthCount(6)}
          >
            6M
          </Button>
          <Button
            variant={monthCount === 12 ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setMonthCount(12)}
          >
            12M
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={displayData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              className="text-xs fill-muted-foreground"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatDollar}
              className="text-xs fill-muted-foreground"
              tick={{ fontSize: 12 }}
              width={65}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={(label) => formatMonthLabel(String(label))}
                  nameFormatter={(name) => name === "income" ? "Income" : "Expenses"}
                />
              }
            />
            <Legend
              formatter={(value: string) => (value === "income" ? "Income" : "Expenses")}
            />
            <Bar dataKey="income" fill="var(--color-positive)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="var(--color-negative)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
