"use client"

/**
 * Dashboard page — the main landing page after login.
 *
 * Assembles all dashboard widgets in a responsive grid layout.
 * Fetches data from server actions on mount and when the global year changes.
 * Shows skeleton loaders while data is loading.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Rocket } from "lucide-react"
import { useYear } from "@/contexts/year-context"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { NetWorthCard } from "@/components/dashboard/net-worth-card"
import { IncomeExpenseChart } from "@/components/dashboard/income-expense-chart"
import { SpendingBreakdown } from "@/components/dashboard/spending-breakdown"
import { CreditUtilization } from "@/components/dashboard/credit-utilization"
import { UpcomingBills } from "@/components/dashboard/upcoming-bills"
import { RecentTransactions } from "@/components/dashboard/recent-transactions"
import { TithingCard, type TithingMonth } from "@/components/dashboard/tithing-card"
import {
  getNetWorth,
  getMonthlyIncomeExpense,
  getSpendingByCategory,
  getCreditUtilization,
  getUpcomingBills,
  getRecentTransactions,
  getTithingData,
  getAccountCount,
} from "@/actions/dashboard"

/** Shape of all dashboard data, null while loading. */
interface DashboardData {
  netWorth: Awaited<ReturnType<typeof getNetWorth>>
  incomeExpense: Awaited<ReturnType<typeof getMonthlyIncomeExpense>>
  spendingByCategory: Awaited<ReturnType<typeof getSpendingByCategory>>
  creditUtilization: Awaited<ReturnType<typeof getCreditUtilization>>
  upcomingBills: Awaited<ReturnType<typeof getUpcomingBills>>
  recentTransactions: Awaited<ReturnType<typeof getRecentTransactions>>
  tithingData: { months: TithingMonth[]; ytdEstimated: number; ytdActual: number } | null
}

/** Skeleton placeholder for a card widget. */
function CardSkeleton({ className = "", lines = 3 }: { className?: string; lines?: number }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

/** Tall skeleton for chart widgets. */
function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { year } = useYear()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [accountCount, setAccountCount] = useState<number | null>(null)

  const currentMonth = new Date().getMonth() + 1 // 1-indexed
  const monthLabel = new Date(year, currentMonth - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        netWorth,
        incomeExpense,
        spendingByCategory,
        creditUtilization,
        upcomingBills,
        recentTransactions,
        tithingData,
        count,
      ] = await Promise.all([
        getNetWorth(year),
        getMonthlyIncomeExpense(),
        getSpendingByCategory(year, currentMonth),
        getCreditUtilization(),
        getUpcomingBills(7),
        getRecentTransactions(10),
        // getTithingData checks tithingEnabled internally and returns null if disabled.
        // Catch independently so tithing errors never break the rest of the dashboard.
        getTithingData(year).catch(() => null),
        getAccountCount(),
      ])

      setAccountCount(count)
      setData({
        netWorth,
        incomeExpense,
        spendingByCategory,
        creditUtilization,
        upcomingBills,
        recentTransactions,
        tithingData,
      })
    } catch (err) {
      console.error("Failed to load dashboard data:", err)
    } finally {
      setLoading(false)
    }
  }, [year, currentMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading || !data) {
    return (
      <div className="space-y-6">
        {/* Top row skeletons */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
        {/* Chart skeletons */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        {/* Bottom row skeletons */}
        <div className="grid gap-6 lg:grid-cols-2">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={6} />
        </div>
      </div>
    )
  }

  if (accountCount === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center pb-2">
            <Rocket className="mx-auto h-10 w-10 text-primary mb-2" />
            <h2 className="text-xl font-bold">Welcome to PersonalLedgr</h2>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              It looks like you&apos;re just getting started. Follow our step-by-step
              guide to set up your accounts and start tracking your finances.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild>
                <Link href="/guide">Getting Started Guide</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/settings">Load Demo Data</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Net Worth, Credit Utilization, Upcoming Bills */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <NetWorthCard {...data.netWorth} />
        <CreditUtilization cards={data.creditUtilization} />
        <UpcomingBills bills={data.upcomingBills} />
      </div>

      {/* Row 2: Income vs Expense chart, Spending Breakdown donut */}
      <div className="grid gap-6 lg:grid-cols-2">
        <IncomeExpenseChart data={data.incomeExpense} />
        <SpendingBreakdown data={data.spendingByCategory} monthLabel={monthLabel} />
      </div>

      {/* Row 3: Recent Transactions (full width) */}
      <RecentTransactions transactions={data.recentTransactions} />

      {/* Row 4: Tithing (full width, only when enabled) */}
      {data.tithingData && (
        <TithingCard
          months={data.tithingData.months}
          ytdEstimated={data.tithingData.ytdEstimated}
          ytdActual={data.tithingData.ytdActual}
        />
      )}
    </div>
  )
}
