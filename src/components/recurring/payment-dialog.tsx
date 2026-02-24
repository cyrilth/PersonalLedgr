"use client"

/**
 * Dialog for recording a bill payment. Offers two modes:
 * 1. "New transaction" — creates an EXPENSE transaction + BillPayment
 * 2. "Link existing" — links an already-imported transaction to the bill
 *
 * This prevents duplicate transactions when users both import bank data
 * and track payments through the ledger.
 */

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Link2, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  recordBillPayment,
  linkTransactionToBill,
  getMatchingTransactions,
  type MatchingTransaction,
} from "@/actions/bill-payments"
import { formatCurrency, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  bill: {
    id: string
    name: string
    amount: number
    isVariableAmount: boolean
    accountId: string
    accountName: string
  } | null
  month: number
  year: number
  accounts: { id: string; name: string }[]
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type Mode = "new" | "link"

export function PaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  bill,
  month,
  year,
  accounts,
}: PaymentDialogProps) {
  const [mode, setMode] = useState<Mode>("new")
  const [amount, setAmount] = useState("")
  const [accountId, setAccountId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Link mode state
  const [matchingTxns, setMatchingTxns] = useState<MatchingTransaction[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null)

  // Reset state and eagerly fetch matching transactions when dialog opens.
  // If matches exist, auto-switch to "Link Existing" mode so users who
  // imported CSVs first see their transactions immediately (edge case #2).
  useEffect(() => {
    if (open && bill) {
      setAmount(bill.amount.toFixed(2))
      setAccountId(bill.accountId)
      setSelectedTxnId(null)
      setMatchingTxns([])
      setLoadingTxns(true)

      getMatchingTransactions(bill.id, month, year)
        .then((txns) => {
          setMatchingTxns(txns)
          setMode(txns.length > 0 ? "link" : "new")
        })
        .catch(() => {
          setMatchingTxns([])
          setMode("new")
        })
        .finally(() => setLoadingTxns(false))
    }
  }, [open, bill, month, year])

  async function handleNewPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!bill) return

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be a positive number")
      return
    }

    if (!accountId) {
      toast.error("Please select a payment account")
      return
    }

    setSubmitting(true)
    try {
      await recordBillPayment({
        recurringBillId: bill.id,
        amount: parsedAmount,
        month,
        year,
        accountId,
      })
      toast.success(`Payment recorded for ${bill.name}`)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to record payment"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLinkTransaction() {
    if (!bill || !selectedTxnId) return

    setSubmitting(true)
    try {
      await linkTransactionToBill({
        recurringBillId: bill.id,
        transactionId: selectedTxnId,
        month,
        year,
      })
      toast.success(`Linked existing transaction to ${bill.name}`)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to link transaction"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!bill) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record payment for <strong>{bill.name}</strong> for{" "}
            {MONTH_NAMES[month - 1]} {year}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex items-center rounded-md border p-0.5">
          <button
            type="button"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "new"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("new")}
          >
            <Plus className="h-3.5 w-3.5" />
            New Transaction
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "link"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("link")}
          >
            <Link2 className="h-3.5 w-3.5" />
            Link Existing
          </button>
        </div>

        {mode === "new" ? (
          <form onSubmit={handleNewPayment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                  disabled={submitting}
                />
              </div>
              {bill.isVariableAmount && (
                <p className="text-xs text-muted-foreground">
                  This is a variable bill. The amount shown is an estimate.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Payment Account</Label>
              <Select
                value={accountId}
                onValueChange={setAccountId}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select an existing transaction to link as this bill&apos;s payment.
              No new transaction will be created.
            </p>

            {loadingTxns ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-md border bg-muted/30 animate-pulse"
                  />
                ))}
              </div>
            ) : matchingTxns.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No matching transactions found for{" "}
                {MONTH_NAMES[month - 1]} {year}.
              </div>
            ) : (
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {matchingTxns.map((txn) => (
                  <button
                    key={txn.id}
                    type="button"
                    className={cn(
                      "w-full rounded-md border p-3 text-left text-sm transition-colors",
                      selectedTxnId === txn.id
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedTxnId(txn.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{txn.description}</span>
                      <span className="text-negative font-medium">
                        {formatCurrency(Math.abs(txn.amount))}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(txn.date)}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {txn.source.toLowerCase()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleLinkTransaction}
                disabled={submitting || !selectedTxnId}
              >
                {submitting ? "Linking..." : "Link Transaction"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
