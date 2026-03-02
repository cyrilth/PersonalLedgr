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
import { Heart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartTooltip } from "@/components/ui/chart-tooltip"
import { formatCurrency } from "@/lib/utils"

export interface TithingMonth {
  month: string
  income: number
  estimated: number
  actual: number
}

interface TithingCardProps {
  months: TithingMonth[]
  ytdEstimated: number
  ytdActual: number
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-")
  const date = new Date(Number(year), Number(m) - 1)
  return date.toLocaleDateString("en-US", { month: "short" })
}

function formatDollar(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function TithingCard({ months, ytdEstimated, ytdActual }: TithingCardProps) {
  const onTrack = ytdActual >= ytdEstimated
  const difference = ytdActual - ytdEstimated

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Heart className="h-4 w-4" />
          Tithing
        </CardTitle>
        <div className="flex flex-col items-end gap-1 text-sm sm:flex-row sm:items-center sm:gap-4">
          <span className="text-muted-foreground">
            YTD Estimated: <span className="font-medium text-foreground">{formatCurrency(ytdEstimated)}</span>
          </span>
          <span className="text-muted-foreground">
            YTD Actual: <span className={`font-medium ${onTrack ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {formatCurrency(ytdActual)}
            </span>
          </span>
          <span className={`text-xs font-medium ${onTrack ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            ({difference >= 0 ? "+" : ""}{formatCurrency(difference)})
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={months} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
                  nameFormatter={(name) => name === "estimated" ? "Estimated" : "Actual"}
                />
              }
            />
            <Legend
              formatter={(value: string) => (value === "estimated" ? "Estimated" : "Actual")}
            />
            <Bar dataKey="estimated" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" fill="var(--color-positive)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
