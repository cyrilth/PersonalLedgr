"use client"

/**
 * Account balance history line chart.
 *
 * Renders a Recharts LineChart inside a Card, showing monthly end-of-month
 * balances over time. For debt accounts (CC/loan/mortgage), balances are
 * displayed as positive values via Math.abs() since they're stored negative.
 *
 * Uses the same tooltip/axis styling conventions as the dashboard charts.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartTooltip } from "@/components/ui/chart-tooltip"

interface BalanceChartProps {
  data: { date: string; balance: number }[]
  /** When true, displays Math.abs(balance) for debt accounts. */
  isDebt?: boolean
}

/** Convert "2026-01" to "Jan" for chart axis labels. */
export function formatMonthLabel(date: string): string {
  const [year, m] = date.split("-")
  const d = new Date(Number(year), Number(m) - 1)
  return d.toLocaleDateString("en-US", { month: "short" })
}

/** Format dollar amounts for tooltip and Y-axis display. */
export function formatDollar(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function BalanceChart({ data, isDebt = false }: BalanceChartProps) {
  const displayData = data.map((d) => ({
    date: d.date,
    balance: isDebt ? Math.abs(d.balance) : d.balance,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Balance History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={displayData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
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
                  nameFormatter={() => "Balance"}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
