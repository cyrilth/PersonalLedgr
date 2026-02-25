"use client"

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

interface MonthData {
  month: string
  income: number
  expense: number
}

interface MonthlyTrendChartProps {
  data: MonthData[]
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-")
  const date = new Date(Number(year), Number(m) - 1)
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

function formatDollar(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Income vs Expenses by Month
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this date range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
                formatter={(value: number | undefined, name?: string) => [
                  formatDollar(value ?? 0),
                  name === "income" ? "Income" : "Expenses",
                ]}
                labelFormatter={(label: unknown) => formatMonthLabel(String(label))}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                }}
              />
              <Legend
                formatter={(value: string) => (value === "income" ? "Income" : "Expenses")}
              />
              <Bar dataKey="income" fill="var(--color-positive)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="var(--color-negative)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
