"use client"

/**
 * Upcoming recurring bills list.
 *
 * Shows the next N bills ordered by due date with:
 * - Days until due (or "overdue" in red)
 * - Amount and payment account
 * - Badge for variable-amount bills marked "(estimated)"
 */

import { CalendarClock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDateShort } from "@/lib/utils"

interface Bill {
  id: string
  name: string
  amount: number
  isVariableAmount: boolean
  nextDueDate: Date | string
  daysUntilDue: number
  account: { id: string; name: string }
}

interface UpcomingBillsProps {
  bills: Bill[]
}

/** Format "days until due" as a human-readable label. */
function dueLabel(days: number): { text: string; className: string } {
  if (days < 0) return { text: "Overdue", className: "text-negative font-medium" }
  if (days === 0) return { text: "Due today", className: "text-yellow-500 font-medium" }
  if (days === 1) return { text: "Tomorrow", className: "text-yellow-500" }
  if (days <= 7) return { text: `${days} days`, className: "text-foreground" }
  return { text: `${days} days`, className: "text-muted-foreground" }
}

export function UpcomingBills({ bills }: UpcomingBillsProps) {
  if (bills.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Upcoming Bills
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No upcoming bills.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
          Upcoming Bills
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {bills.map((bill) => {
            const due = dueLabel(bill.daysUntilDue)
            return (
              <div key={bill.id} className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{bill.name}</span>
                    {bill.isVariableAmount && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        estimated
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDateShort(bill.nextDueDate)}</span>
                    <span>·</span>
                    <span>{bill.account.name}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-medium">{formatCurrency(bill.amount)}</p>
                  <p className={`text-xs ${due.className}`}>{due.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
