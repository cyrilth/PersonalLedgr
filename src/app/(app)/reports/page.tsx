"use client"

import { useEffect, useState, useCallback } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { DateRangePicker } from "@/components/reports/date-range-picker"
import { SummaryCards } from "@/components/reports/summary-cards"
import { CategoryTable } from "@/components/reports/category-table"
import { MonthlyTrendChart } from "@/components/reports/monthly-trend-chart"
import { CategoryDonut } from "@/components/reports/category-donut"
import {
  getCategoryRunningTotals,
  getIncomeVsExpenseByMonth,
  getIncomeByCategory,
} from "@/actions/reports"

interface ReportData {
  categoryTotals: Awaited<ReturnType<typeof getCategoryRunningTotals>>
  monthlyTrend: Awaited<ReturnType<typeof getIncomeVsExpenseByMonth>>
  incomeByCategory: Awaited<ReturnType<typeof getIncomeByCategory>>
}

function formatDateInput(date: Date): string {
  return date.toISOString().split("T")[0]
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const now = new Date()
  const [startDate, setStartDate] = useState(formatDateInput(new Date(now.getFullYear(), 0, 1)))
  const [endDate, setEndDate] = useState(formatDateInput(now))
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (start: string, end: string) => {
    setLoading(true)
    try {
      const [categoryTotals, monthlyTrend, incomeByCategory] = await Promise.all([
        getCategoryRunningTotals(start, end),
        getIncomeVsExpenseByMonth(start, end),
        getIncomeByCategory(start, end),
      ])
      setData({ categoryTotals, monthlyTrend, incomeByCategory })
    } catch (err) {
      console.error("Failed to load report data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(startDate, endDate)
  }, [startDate, endDate, loadData])

  function handleRangeChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
  }

  // Build spending breakdown from category totals for donut chart
  const spendingByCategory = data
    ? data.categoryTotals.categories
        .filter((c) => c.totalSpending > 0)
        .map((c) => ({ category: c.category, amount: c.totalSpending }))
    : []

  return (
    <div className="space-y-6">
      {/* Date Range Picker */}
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onRangeChange={handleRangeChange}
      />

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <SummaryCards
          totalIncome={data.categoryTotals.totalIncome}
          totalSpending={data.categoryTotals.totalSpending}
          net={data.categoryTotals.net}
          totalCount={data.categoryTotals.totalCount}
        />
      ) : null}

      {/* Monthly Trend Chart */}
      {loading ? (
        <ChartSkeleton />
      ) : data ? (
        <MonthlyTrendChart data={data.monthlyTrend} />
      ) : null}

      {/* Category Running Totals Table */}
      {loading ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : data ? (
        <CategoryTable
          data={data.categoryTotals.categories}
          totalSpending={data.categoryTotals.totalSpending}
          totalIncome={data.categoryTotals.totalIncome}
          totalCount={data.categoryTotals.totalCount}
        />
      ) : null}

      {/* Donut Charts */}
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryDonut data={spendingByCategory} title="Spending by Category" />
          <CategoryDonut data={data.incomeByCategory} title="Income by Category" />
        </div>
      ) : null}
    </div>
  )
}
