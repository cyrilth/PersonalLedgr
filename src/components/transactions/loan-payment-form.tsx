"use client"

/**
 * Loan payment dialog for recording payments from a checking/savings account
 * to a loan account. Shows a preview of the principal/interest split before
 * confirming. Uses the recordLoanPayment() server action.
 */

import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { recordLoanPayment } from "@/actions/loan-payments"
import { formatCurrency } from "@/lib/utils"

interface AccountOption {
  id: string
  name: string
  type: string
  owner: string | null
  balance: number
}

interface LoanAccountOption extends AccountOption {
  loan: {
    interestRate: number
    monthlyPayment: number
  }
}

interface LoanPaymentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  accounts: AccountOption[]
  loanAccounts: LoanAccountOption[]
  /** Pre-select a loan account when the dialog opens (e.g. from the Payment Tracker grid). */
  defaultLoanAccountId?: string
  /** Pre-fill the payment date (YYYY-MM-DD), e.g. to match the month clicked in the grid. */
  defaultDate?: string
  /**
   * Pre-fill the amount for the pre-selected loan — e.g. the interest-only amount
   * due during an interest-only month. Falls back to the loan's monthly payment.
   */
  defaultAmount?: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function LoanPaymentForm({
  open,
  onOpenChange,
  onSuccess,
  accounts,
  loanAccounts,
  defaultLoanAccountId,
  defaultDate,
  defaultAmount,
}: LoanPaymentFormProps) {
  const [loanAccountId, setLoanAccountId] = useState("")
  const [fromAccountId, setFromAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedLoan = loanAccounts.find((a) => a.id === loanAccountId)

  // Pre-fill amount when the selected loan changes. For the loan pre-selected
  // from the grid, use the phase-aware suggested amount (e.g. the interest-only
  // amount during an interest-only month) when provided; else the monthly payment.
  useEffect(() => {
    if (!selectedLoan) return
    const useDefault =
      selectedLoan.id === defaultLoanAccountId && defaultAmount != null && defaultAmount > 0
    setAmount(String(useDefault ? defaultAmount : selectedLoan.loan.monthlyPayment))
  }, [selectedLoan, defaultLoanAccountId, defaultAmount])

  // Auto-generate description
  useEffect(() => {
    if (descriptionTouched) return
    const from = accounts.find((a) => a.id === fromAccountId)
    const loan = loanAccounts.find((a) => a.id === loanAccountId)
    if (from && loan) {
      setDescription(`Loan Payment: ${from.name} → ${loan.name}`)
    } else {
      setDescription("")
    }
  }, [fromAccountId, loanAccountId, accounts, loanAccounts, descriptionTouched])

  // Reset on open: pre-select the loan/date when provided (Payment Tracker grid),
  // otherwise default to no loan and today's date. Pre-fill the amount from the
  // pre-selected loan here too — the selectedLoan pre-fill effect below only runs
  // when the loan id *changes*, so reopening the same loan would otherwise leave
  // the amount blank.
  useEffect(() => {
    if (open) {
      const firstChecking = accounts.find((a) => a.type === "CHECKING")
      const presetLoan = defaultLoanAccountId
        ? loanAccounts.find((a) => a.id === defaultLoanAccountId)
        : undefined
      setLoanAccountId(defaultLoanAccountId ?? "")
      setFromAccountId(firstChecking?.id ?? "")
      setAmount(
        presetLoan
          ? String(
              defaultAmount != null && defaultAmount > 0
                ? defaultAmount
                : presetLoan.loan.monthlyPayment
            )
          : ""
      )
      setDate(defaultDate ?? new Date().toISOString().split("T")[0])
      setDescription("")
      setDescriptionTouched(false)
    }
  }, [open, accounts, loanAccounts, defaultLoanAccountId, defaultDate, defaultAmount])

  // Calculate preview split
  const preview = useMemo(() => {
    const parsedAmount = parseFloat(amount)
    if (!selectedLoan || !parsedAmount || parsedAmount <= 0) return null

    const loanBalance = Math.abs(selectedLoan.balance)
    // interestRate is stored as a percentage (e.g. 6 = 6%), matching the server
    // split in recordLoanPayment — divide by 100 before computing monthly interest.
    const monthlyInterest = round2((loanBalance * selectedLoan.loan.interestRate) / 100 / 12)

    if (parsedAmount <= monthlyInterest) {
      return { interest: round2(parsedAmount), principal: 0 }
    }
    return { interest: monthlyInterest, principal: round2(parsedAmount - monthlyInterest) }
  }, [amount, selectedLoan])

  function formatAccountLabel(account: AccountOption) {
    return account.owner ? `${account.name} (${account.owner})` : account.name
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsedAmount = parseFloat(amount)

    if (!loanAccountId) {
      toast.error("Please select a loan account")
      return
    }
    if (!fromAccountId) {
      toast.error("Please select a source account")
      return
    }
    if (fromAccountId === loanAccountId) {
      toast.error("Source and loan accounts must be different")
      return
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Amount must be greater than zero")
      return
    }

    setSaving(true)
    try {
      const result = await recordLoanPayment({
        loanAccountId,
        fromAccountId,
        amount: parsedAmount,
        date,
        description: description || undefined,
      })
      // The server caps principal at the outstanding balance, so the amount
      // actually withdrawn can be less than what was entered.
      const charged = Math.abs(result.totalAmount)
      if (charged < parsedAmount - 0.005) {
        toast.success(
          `Loan paid off — payment reduced to ${formatCurrency(charged)} (remaining balance was less than the entered amount)`
        )
      } else {
        toast.success("Loan payment recorded")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record loan payment")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Loan Payment</DialogTitle>
          <DialogDescription>
            Pay a loan from one of your accounts. Interest and principal are split automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loan-account">Loan Account</Label>
            <Select value={loanAccountId} onValueChange={setLoanAccountId}>
              <SelectTrigger id="loan-account" className="w-full">
                <SelectValue placeholder="Select loan account" />
              </SelectTrigger>
              <SelectContent>
                {loanAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="from-account">From Account</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger id="from-account" className="w-full">
                <SelectValue placeholder="Select source account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount">Amount</Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-date">Date</Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-description">Description</Label>
            <Input
              id="payment-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setDescriptionTouched(true)
              }}
              placeholder="Loan Payment"
            />
          </div>

          {preview && (
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/50">
              <p className="font-medium">Payment Breakdown</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Principal</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(preview.principal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest</span>
                <span className="text-red-600 dark:text-red-400">
                  {formatCurrency(preview.interest)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
