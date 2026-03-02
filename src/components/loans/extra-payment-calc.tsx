"use client"

/**
 * Extra payment impact calculator for loan detail pages.
 *
 * Allows the user to input an additional monthly payment amount and
 * immediately see the impact: months saved, interest saved, and
 * new estimated payoff date. Includes a Recharts comparison line chart
 * plotting remaining balance over time with and without extra payments.
 *
 * Uses calculateExtraPaymentImpact and generateAmortizationSchedule
 * from @/lib/calculations for the underlying math.
 */

import { useState, useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/utils"
import { ChartTooltip } from "@/components/ui/chart-tooltip"
import {
  calculateExtraPaymentImpact,
  generateAmortizationSchedule,
} from "@/lib/calculations"

// ── Props ──────────────────────────────────────────────────────────────

interface ExtraPaymentCalcProps {
  balance: number
  apr: number
  monthlyPayment: number
  termMonths: number
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Format dollar amounts for chart axis and tooltip display. */
function formatDollar(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

/**
 * Estimate the payoff date by adding the given number of months to today.
 * Returns a formatted "Mon YYYY" string.
 */
function getPayoffDateLabel(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Renders an interactive extra payment calculator with a stats summary
 * and a comparison line chart showing balance paydown with and without
 * extra monthly payments.
 */
export function ExtraPaymentCalc({
  balance,
  apr,
  monthlyPayment,
  termMonths,
}: ExtraPaymentCalcProps) {
  const [extraAmount, setExtraAmount] = useState(0)

  const MAX_MONTHS = 600

  // ── Impact calculation ─────────────────────────────────────────────

  const impact = useMemo(() => {
    if (extraAmount <= 0) return null
    return calculateExtraPaymentImpact(balance, apr, monthlyPayment, extraAmount)
  }, [balance, apr, monthlyPayment, extraAmount])

  const baseSchedule = useMemo(
    () => generateAmortizationSchedule(balance, apr, monthlyPayment, MAX_MONTHS),
    [balance, apr, monthlyPayment]
  )

  const extraSchedule = useMemo(
    () =>
      extraAmount > 0
        ? generateAmortizationSchedule(
            balance,
            apr,
            monthlyPayment + extraAmount,
            MAX_MONTHS
          )
        : [],
    [balance, apr, monthlyPayment, extraAmount]
  )

  // ── Chart data ─────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    const maxLen = Math.max(baseSchedule.length, extraSchedule.length)
    const data: {
      month: number
      without: number
      with?: number
    }[] = []

    for (let i = 0; i < maxLen; i++) {
      const entry: { month: number; without: number; with?: number } = {
        month: i + 1,
        without: baseSchedule[i]?.remainingBalance ?? 0,
      }
      if (extraSchedule.length > 0) {
        entry.with = extraSchedule[i]?.remainingBalance ?? 0
      }
      data.push(entry)
    }

    return data
  }, [baseSchedule, extraSchedule])

  const basePayoffMonths = baseSchedule.length
  const monthsSaved = impact ? basePayoffMonths - impact.newPayoffMonths : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Extra Payment Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input */}
        <div className="max-w-xs space-y-2">
          <Label htmlFor="extra-payment">Extra Monthly Payment</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="extra-payment"
              type="number"
              min={0}
              step={25}
              placeholder="0.00"
              className="pl-7"
              value={extraAmount || ""}
              onChange={(e) =>
                setExtraAmount(Math.max(0, parseFloat(e.target.value) || 0))
              }
            />
          </div>
        </div>

        {/* Stats grid */}
        {impact && extraAmount > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">Months Saved</p>
              <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {monthsSaved}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">Interest Saved</p>
              <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(impact.interestSaved)}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">New Payoff Date</p>
              <p className="mt-1 text-xl font-semibold">
                {getPayoffDateLabel(impact.newPayoffMonths)}
              </p>
            </div>
          </div>
        )}

        {/* Comparison chart */}
        {chartData.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Balance Over Time
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <XAxis
                  dataKey="month"
                  label={{
                    value: "Month",
                    position: "insideBottomRight",
                    offset: -5,
                    className: "fill-muted-foreground",
                  }}
                  className="text-xs fill-muted-foreground"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={formatDollar}
                  className="text-xs fill-muted-foreground"
                  tick={{ fontSize: 12 }}
                  width={70}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(label) => `Month ${label}`}
                      nameFormatter={(name) => name === "without" ? "Without Extra" : "With Extra"}
                    />
                  }
                />
                <Legend
                  formatter={(value: string) =>
                    value === "without" ? "Without Extra" : "With Extra"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="without"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
                {extraAmount > 0 && (
                  <Line
                    type="monotone"
                    dataKey="with"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
