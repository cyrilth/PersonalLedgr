"use client"

/**
 * Interest summary dashboard card.
 *
 * Displays a side-by-side comparison of interest charged, earned, and net
 * for the current month and year-to-date. Positive net interest is shown
 * in green (favorable) and negative in red (unfavorable).
 */

import { TrendingDown, TrendingUp, ArrowLeftRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

/** Props for the InterestSummary dashboard card. */
interface InterestSummaryProps {
  /** Interest totals for the current calendar month. */
  thisMonth: {
    charged: number
    earned: number
    net: number
  }
  /** Interest totals for the current calendar year to date. */
  thisYear: {
    charged: number
    earned: number
    net: number
  }
}

export function InterestSummary({ thisMonth, thisYear }: InterestSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Interest Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* This Month */}
          <InterestColumn label="This Month" data={thisMonth} />
          {/* This Year */}
          <InterestColumn label="This Year" data={thisYear} />
        </div>
      </CardContent>
    </Card>
  )
}

/** A single column showing charged, earned, and net interest values. */
function InterestColumn({
  label,
  data,
}: {
  label: string
  data: { charged: number; earned: number; net: number }
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>

      {/* Interest Charged */}
      <div className="flex items-center gap-1.5">
        <TrendingDown className="h-3.5 w-3.5 text-negative" />
        <div>
          <p className="text-xs text-muted-foreground">Charged</p>
          <p className="text-sm font-semibold text-negative">
            {formatCurrency(data.charged)}
          </p>
        </div>
      </div>

      {/* Interest Earned */}
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-positive" />
        <div>
          <p className="text-xs text-muted-foreground">Earned</p>
          <p className="text-sm font-semibold text-positive">
            {formatCurrency(data.earned)}
          </p>
        </div>
      </div>

      {/* Net Interest */}
      <div className="flex items-center gap-1.5">
        <ArrowLeftRight
          className={`h-3.5 w-3.5 ${
            data.net >= 0 ? "text-positive" : "text-negative"
          }`}
        />
        <div>
          <p className="text-xs text-muted-foreground">Net</p>
          <p
            className={`text-sm font-semibold ${
              data.net >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatCurrency(data.net)}
          </p>
        </div>
      </div>
    </div>
  )
}
