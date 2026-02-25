"use client"

import { PieChart, Pie, Cell, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface CategoryData {
  category: string
  amount: number
}

interface CategoryDonutProps {
  data: CategoryData[]
  title: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-lg border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-md">
      <span className="font-medium">{name}</span>
      <span className="ml-2">{formatCurrency(value ?? 0)}</span>
    </div>
  )
}

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

export function CategoryDonut({ data, title }: CategoryDonutProps) {
  const total = data.reduce((sum, d) => sum + d.amount, 0)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data for this date range.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
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
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} wrapperStyle={{ zIndex: 10 }} />
            </PieChart>
          </div>

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
                    {total > 0 ? `${Math.round((item.amount / total) * 100)}%` : "\u2014"}
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
