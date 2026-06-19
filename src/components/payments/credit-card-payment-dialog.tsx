"use client"

/**
 * Dialog for paying a credit card from the Payment Tracker.
 *
 * A credit-card payment is money moving between your own accounts, so it is
 * recorded as a TRANSFER (funding account → card) via createTransfer — the same
 * positive-into-the-card transfer that getPaymentRecords counts as a paid cell.
 *
 * Mirrors the bill PaymentDialog / loan LoanPaymentForm "record payment" flow so
 * all three obligation types in the grid behave consistently. Offers quick-fill
 * presets for the statement balance, current balance, and minimum due.
 */

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"
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
import { createTransfer } from "@/actions/transfers"
import { formatCurrency, cn } from "@/lib/utils"

interface SourceAccount {
  id: string
  name: string
  type: string
  owner: string | null
  balance: number
}

interface CreditCardPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  card: {
    accountId: string
    name: string
    /** Last statement balance owed (positive). */
    statementBalance: number
    /** Current balance owed right now (positive; 0 if nothing owed). */
    currentBalance: number
    /** Computed minimum due (positive; 0 if nothing owed). */
    minimumPayment: number
  } | null
  month: number
  year: number
  /** Pre-filled payment date, anchored on the clicked month's due day. */
  defaultDate: string
  /** Funding accounts the payment can come from (assets only). */
  fromAccounts: SourceAccount[]
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function CreditCardPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  card,
  month,
  year,
  defaultDate,
  fromAccounts,
}: CreditCardPaymentDialogProps) {
  const [fromAccountId, setFromAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(defaultDate)
  const [submitting, setSubmitting] = useState(false)

  // Reset state when the dialog opens. Default the amount to the statement
  // balance when one is owed, otherwise the current balance.
  useEffect(() => {
    if (open && card) {
      const defaultAmount =
        card.statementBalance > 0 ? card.statementBalance : card.currentBalance
      setAmount(defaultAmount > 0 ? defaultAmount.toFixed(2) : "")
      setFromAccountId("")
      setDate(defaultDate)
    }
  }, [open, card, defaultDate])

  if (!card) return null

  const presets = [
    { key: "statement", label: "Statement balance", value: card.statementBalance },
    { key: "current", label: "Current balance", value: card.currentBalance },
    { key: "minimum", label: "Minimum payment", value: card.minimumPayment },
  ].filter((p) => p.value > 0)

  // Soft guard against an accidental overpayment (likely a typo). Overpaying a
  // card is legitimate — it leaves a credit balance — so we warn and relabel the
  // action rather than blocking it.
  const parsedAmount = parseFloat(amount)
  const isOverpayment =
    card.currentBalance > 0 &&
    !isNaN(parsedAmount) &&
    parsedAmount > card.currentBalance

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!card) return

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be a positive number")
      return
    }
    if (!fromAccountId) {
      toast.error("Please select a payment account")
      return
    }

    const from = fromAccounts.find((a) => a.id === fromAccountId)

    setSubmitting(true)
    try {
      await createTransfer({
        fromAccountId,
        toAccountId: card.accountId,
        amount: parsedAmount,
        date,
        description: from
          ? `Payment: ${from.name} → ${card.name}`
          : `Credit card payment: ${card.name}`,
      })
      toast.success(`Payment recorded for ${card.name}`)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay Credit Card</DialogTitle>
          <DialogDescription>
            Record a payment to <strong>{card.name}</strong> for{" "}
            {MONTH_NAMES[month - 1]} {year}. This is a transfer from your funding
            account to the card.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Pay from</Label>
            <Select
              value={fromAccountId}
              onValueChange={setFromAccountId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {fromAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.owner ? `${a.name} (${a.owner})` : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc-payment-amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="cc-payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
                disabled={submitting}
              />
            </div>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {presets.map((p) => {
                  const presetValue = p.value.toFixed(2)
                  const active = amount === presetValue
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setAmount(presetValue)}
                      disabled={submitting}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {p.label}: {formatCurrency(p.value)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc-payment-date">Date</Label>
            <Input
              id="cc-payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          {isOverpayment && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {formatCurrency(parsedAmount)} is more than the{" "}
                {formatCurrency(card.currentBalance)} currently owed on {card.name}.
                This will leave a credit balance — record only if you mean to overpay.
              </span>
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
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Recording..."
                : isOverpayment
                  ? "Record anyway"
                  : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
