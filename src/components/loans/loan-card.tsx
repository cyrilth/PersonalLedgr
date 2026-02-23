/**
 * Clickable loan card for the loans list page.
 *
 * Displays loan name, type icon, lender/owner, current balance vs original
 * principal as a payoff progress bar, APR, monthly payment amount, and an
 * estimated payoff date. The card links to the loan detail page.
 *
 * Loan balances are stored as negative values in the database (money owed)
 * but displayed here as positive using Math.abs().
 */

"use client"

import Link from "next/link"
import { Home, Car, GraduationCap, HandCoins, Calendar, Percent } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatCurrency, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { LOAN_TYPE_LABELS } from "@/lib/constants"

// ── Props ──────────────────────────────────────────────────────────────

interface LoanCardProps {
  id: string
  accountId: string
  accountName: string
  loanType: string
  balance: number
  originalBalance: number
  interestRate: number
  termMonths: number
  startDate: Date
  monthlyPayment: number
  extraPaymentAmount: number
  owner: string | null
}

// ── Icon Map ───────────────────────────────────────────────────────────

/** Maps loan type enum to its display icon. */
const LOAN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MORTGAGE: Home,
  AUTO: Car,
  STUDENT: GraduationCap,
  PERSONAL: HandCoins,
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Calculate payoff progress as a percentage.
 * Returns 0-100 representing how much of the original principal has been paid off.
 */
function getPayoffProgress(balance: number, originalBalance: number): number {
  if (originalBalance <= 0) return 0
  const absBalance = Math.abs(balance)
  const paid = originalBalance - absBalance
  const pct = (paid / originalBalance) * 100
  return Math.max(0, Math.min(pct, 100))
}

/**
 * Estimate the payoff date based on remaining balance and monthly payment.
 * Adds the calculated months remaining to the current date.
 * Returns null if monthly payment is zero or balance is already paid off.
 */
function estimatePayoffDate(balance: number, monthlyPayment: number): Date | null {
  const absBalance = Math.abs(balance)
  if (absBalance <= 0 || monthlyPayment <= 0) return null

  const monthsRemaining = Math.ceil(absBalance / monthlyPayment)
  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + monthsRemaining)
  return payoffDate
}

// ── Component ──────────────────────────────────────────────────────────

export function LoanCard({
  id,
  accountName,
  loanType,
  balance,
  originalBalance,
  interestRate,
  monthlyPayment,
  owner,
}: LoanCardProps) {
  const Icon = LOAN_ICON_MAP[loanType] || HandCoins
  const displayBalance = Math.abs(balance)
  const progress = getPayoffProgress(balance, originalBalance)
  const payoffDate = estimatePayoffDate(balance, monthlyPayment)
  const typeLabel = LOAN_TYPE_LABELS[loanType as keyof typeof LOAN_TYPE_LABELS] ?? loanType

  return (
    <Link href={`/loans/${id}`}>
      <Card className={cn("transition-colors hover:bg-muted/50")}>
        <CardContent className="p-4">
          {/* Header: icon, name, owner, balance */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{accountName}</p>
                <p className="text-xs text-muted-foreground">
                  {typeLabel}
                  {owner ? ` · ${owner}` : ""}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold text-negative">
              {formatCurrency(displayBalance)}
            </p>
          </div>

          {/* Payoff progress bar */}
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {formatCurrency(originalBalance - displayBalance)} paid of{" "}
                {formatCurrency(originalBalance)}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {progress.toFixed(0)}%
              </span>
            </div>
            <Progress
              value={progress}
              className={cn("h-1.5", "[&>div]:bg-emerald-600 dark:[&>div]:bg-emerald-400")}
            />
          </div>

          {/* Detail row: APR, monthly payment, payoff date */}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Percent className="h-3 w-3" />
              {interestRate.toFixed(2)}% APR
            </span>
            <span>
              {formatCurrency(monthlyPayment)}/mo
            </span>
            {payoffDate && (
              <span className="flex items-center gap-1 ml-auto">
                <Calendar className="h-3 w-3" />
                {formatDate(payoffDate)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
