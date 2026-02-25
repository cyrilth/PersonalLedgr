"use client"

import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { DollarSign, TrendingDown, TrendingUp, Hash } from "lucide-react"

interface SummaryCardsProps {
  totalIncome: number
  totalSpending: number
  net: number
  totalCount: number
}

export function SummaryCards({ totalIncome, totalSpending, net, totalCount }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Total Income
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalIncome)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Total Spending
          </div>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(totalSpending)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Net
          </div>
          <p className={`mt-1 text-2xl font-bold ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {formatCurrency(net)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hash className="h-4 w-4" />
            Transactions
          </div>
          <p className="mt-1 text-2xl font-bold">
            {totalCount.toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
