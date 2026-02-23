"use client"

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

interface BalanceChartProps {
  data: { date: string; balance: number }[]
  isDebt?: boolean
}

function formatMonthLabel(date: string): string {
  const [year, m] = date.split("-")
  const d = new Date(Number(year), Number(m) - 1)
  return d.toLocaleDateString("en-US", { month: "short" })
}

function formatDollar(value: number): string {
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
              formatter={(value: number | undefined) => [formatDollar(value ?? 0), "Balance"]}
              labelFormatter={(label: unknown) => formatMonthLabel(String(label))}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
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
