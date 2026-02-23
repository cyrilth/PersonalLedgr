"use client"

/**
 * Recent transactions list.
 *
 * Shows the last N transactions with color-coded amounts:
 * - Green (positive) for income types
 * - Red (negative) for expense types
 * - Blue/gray for transfers
 */

import { ArrowLeftRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDateShort } from "@/lib/utils"
import { INCOME_TYPES, SPENDING_TYPES } from "@/lib/constants"

interface Transaction {
  id: string
  date: Date | string
  description: string
  amount: number
  type: string
  category: string | null
  account: { id: string; name: string }
}

interface RecentTransactionsProps {
  transactions: Transaction[]
}

/** Get color class for transaction amount based on its type. */
function getAmountColor(type: string): string {
  if ((INCOME_TYPES as readonly string[]).includes(type)) return "text-positive"
  if ((SPENDING_TYPES as readonly string[]).includes(type)) return "text-negative"
  return "text-transfer" // transfers and loan principal
}

/** Format amount with sign: income positive, spending negative, transfers show stored sign. */
function formatAmount(amount: number, type: string): string {
  if ((INCOME_TYPES as readonly string[]).includes(type)) {
    return `+${formatCurrency(Math.abs(amount))}`
  }
  if ((SPENDING_TYPES as readonly string[]).includes(type)) {
    return `-${formatCurrency(Math.abs(amount))}`
  }
  // Transfers: show the actual sign to indicate direction
  return amount >= 0 ? `+${formatCurrency(amount)}` : `-${formatCurrency(Math.abs(amount))}`
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ArrowLeftRight className="h-4 w-4" />
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeftRight className="h-4 w-4" />
          Recent Transactions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{t.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDateShort(t.date)}</span>
                  <span>·</span>
                  <span>{t.account.name}</span>
                  {t.category && (
                    <>
                      <span>·</span>
                      <span>{t.category}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={`text-sm font-medium flex-shrink-0 ml-3 ${getAmountColor(t.type)}`}>
                {formatAmount(t.amount, t.type)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
