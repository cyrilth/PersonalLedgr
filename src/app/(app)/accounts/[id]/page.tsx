"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Pencil, Trash2, RefreshCw, CheckCircle } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { BalanceChart } from "@/components/accounts/balance-chart"
import { AccountForm } from "@/components/accounts/account-form"
import {
  getAccount,
  deleteAccount,
  recalculateBalance,
  confirmRecalculate,
} from "@/actions/accounts"
import {
  ACCOUNT_TYPE_LABELS,
  LOAN_TYPE_LABELS,
  APR_RATE_TYPE_LABELS,
  INCOME_TYPES,
  SPENDING_TYPES,
} from "@/lib/constants"
import type { AccountType, LoanType, AprRateType } from "@/lib/constants"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils"
import { cn } from "@/lib/utils"

type AccountDetail = Awaited<ReturnType<typeof getAccount>>

const DEBT_TYPES = ["CREDIT_CARD", "LOAN", "MORTGAGE"]

function getAmountColor(type: string): string {
  if ((INCOME_TYPES as readonly string[]).includes(type)) return "text-positive"
  if ((SPENDING_TYPES as readonly string[]).includes(type)) return "text-negative"
  return "text-transfer"
}

function formatAmount(amount: number, type: string): string {
  if ((INCOME_TYPES as readonly string[]).includes(type)) {
    return `+${formatCurrency(Math.abs(amount))}`
  }
  if ((SPENDING_TYPES as readonly string[]).includes(type)) {
    return `-${formatCurrency(Math.abs(amount))}`
  }
  return amount >= 0 ? `+${formatCurrency(amount)}` : `-${formatCurrency(Math.abs(amount))}`
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-4 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-[250px] w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-4 w-32" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function AccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [recalcResult, setRecalcResult] = useState<{
    stored: number
    calculated: number
    drift: number
  } | null>(null)
  const [recalculating, setRecalculating] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAccount(id)
      setAccount(data)
    } catch (err) {
      console.error("Failed to load account:", err)
      toast.error("Failed to load account")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this account?")) return
    try {
      await deleteAccount(id)
      toast.success("Account deleted")
      router.push("/accounts")
    } catch (err) {
      toast.error("Failed to delete account")
      console.error(err)
    }
  }

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const result = await recalculateBalance(id)
      setRecalcResult(result)
    } catch (err) {
      toast.error("Failed to recalculate")
      console.error(err)
    } finally {
      setRecalculating(false)
    }
  }

  async function handleApplyCorrection() {
    try {
      const result = await confirmRecalculate(id)
      toast.success(`Balance corrected to ${formatCurrency(result.balance)}`)
      setRecalcResult(null)
      fetchData()
    } catch (err) {
      toast.error("Failed to apply correction")
      console.error(err)
    }
  }

  if (loading) return <DetailSkeleton />
  if (!account) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">Account not found.</p>
        <Link href="/accounts">
          <Button variant="outline">Back to Accounts</Button>
        </Link>
      </div>
    )
  }

  const isDebt = DEBT_TYPES.includes(account.type)
  const displayBalance = isDebt ? Math.abs(account.balance) : account.balance

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/accounts">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{ACCOUNT_TYPE_LABELS[account.type as AccountType]}</span>
              {account.owner && <span>· {account.owner}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Balance + Recalculate */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className={cn("text-3xl font-bold", isDebt && "text-negative")}>
              {formatCurrency(displayBalance)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculate}
              disabled={recalculating}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", recalculating && "animate-spin")} />
              Recalculate
            </Button>
            {recalcResult && (
              <div className="text-right text-sm">
                {recalcResult.drift === 0 ? (
                  <span className="flex items-center gap-1 text-positive">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Balance is correct
                  </span>
                ) : (
                  <div className="space-y-1">
                    <p>
                      Stored: {formatCurrency(recalcResult.stored)} · Calculated:{" "}
                      {formatCurrency(recalcResult.calculated)}
                    </p>
                    <p className="text-negative">
                      Drift: {formatCurrency(recalcResult.drift)}
                    </p>
                    <Button size="sm" variant="default" onClick={handleApplyCorrection}>
                      Apply Correction
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Balance Chart */}
      {account.balanceHistory.length > 0 && (
        <BalanceChart data={account.balanceHistory} isDebt={isDebt} />
      )}

      {/* Credit Card Details */}
      {account.creditCardDetails && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Credit Card Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Statement Close Day</dt>
                <dd className="font-medium">{account.creditCardDetails.statementCloseDay}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payment Due Day</dt>
                <dd className="font-medium">{account.creditCardDetails.paymentDueDay}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Grace Period</dt>
                <dd className="font-medium">{account.creditCardDetails.gracePeriodDays} days</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last Statement</dt>
                <dd className="font-medium">
                  {formatCurrency(account.creditCardDetails.lastStatementBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid in Full</dt>
                <dd className="font-medium">
                  {account.creditCardDetails.lastStatementPaidInFull ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Min Payment</dt>
                <dd className="font-medium">
                  {(account.creditCardDetails.minimumPaymentPct * 100).toFixed(1)}% (min{" "}
                  {formatCurrency(account.creditCardDetails.minimumPaymentFloor)})
                </dd>
              </div>
              {account.creditLimit && (
                <div>
                  <dt className="text-muted-foreground">Credit Limit</dt>
                  <dd className="font-medium">{formatCurrency(account.creditLimit)}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* APR Rates Table */}
      {account.aprRates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              APR Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Rate</th>
                    <th className="pb-2 pr-4 font-medium">Effective</th>
                    <th className="pb-2 font-medium">Expiration</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {account.aprRates.map((rate) => (
                    <tr key={rate.id}>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">
                          {APR_RATE_TYPE_LABELS[rate.rateType as AprRateType]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {(rate.apr * 100).toFixed(2)}%
                      </td>
                      <td className="py-2 pr-4">{formatDate(rate.effectiveDate)}</td>
                      <td className="py-2">
                        {rate.expirationDate ? formatDate(rate.expirationDate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loan Details */}
      {account.loan && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Loan Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Loan Type</dt>
                <dd className="font-medium">
                  {LOAN_TYPE_LABELS[account.loan.loanType as LoanType]}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Original Balance</dt>
                <dd className="font-medium">
                  {formatCurrency(account.loan.originalBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Interest Rate</dt>
                <dd className="font-medium">
                  {(account.loan.interestRate * 100).toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Term</dt>
                <dd className="font-medium">{account.loan.termMonths} months</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Start Date</dt>
                <dd className="font-medium">{formatDate(account.loan.startDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monthly Payment</dt>
                <dd className="font-medium">
                  {formatCurrency(account.loan.monthlyPayment)}
                </dd>
              </div>
              {account.loan.extraPaymentAmount > 0 && (
                <div>
                  <dt className="text-muted-foreground">Extra Payment</dt>
                  <dd className="font-medium">
                    {formatCurrency(account.loan.extraPaymentAmount)}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {account.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="space-y-3">
              {account.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateShort(t.date)}</span>
                      {t.category && (
                        <>
                          <span>·</span>
                          <span>{t.category}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium flex-shrink-0 ml-3",
                      getAmountColor(t.type)
                    )}
                  >
                    {formatAmount(t.amount, t.type)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <AccountForm
        open={editOpen}
        onOpenChange={setEditOpen}
        account={account}
        onSuccess={fetchData}
      />
    </div>
  )
}
