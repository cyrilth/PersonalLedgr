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
}: LoanPaymentFormProps) {
  const [loanAccountId, setLoanAccountId] = useState("")
  const [fromAccountId, setFromAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedLoan = loanAccounts.find((a) => a.id === loanAccountId)

  // Pre-fill amount when loan is selected
  useEffect(() => {
    if (selectedLoan) {
      setAmount(String(selectedLoan.loan.monthlyPayment))
    }
  }, [selectedLoan])

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

  // Default from-account to first checking account
  useEffect(() => {
    if (open) {
      const firstChecking = accounts.find((a) => a.type === "CHECKING")
      setLoanAccountId("")
      setFromAccountId(firstChecking?.id ?? "")
      setAmount("")
      setDate(new Date().toISOString().split("T")[0])
      setDescription("")
      setDescriptionTouched(false)
    }
  }, [open, accounts])

  // Calculate preview split
  const preview = useMemo(() => {
    const parsedAmount = parseFloat(amount)
    if (!selectedLoan || !parsedAmount || parsedAmount <= 0) return null

    const loanBalance = Math.abs(selectedLoan.balance)
    const monthlyInterest = round2(loanBalance * selectedLoan.loan.interestRate / 12)

    if (parsedAmount <= monthlyInterest) {
      return { interest: round2(parsedAmount), principal: 0 }
    }
    return { interest: monthlyInterest, principal: round2(parsedAmount - monthlyInterest) }
  }, [amount, selectedLoan])

  function formatAccountLabel(account: AccountOption) {
    return account.owner ? `${account.name} (${account.owner})` : account.name
  }

  function formatCurrency(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
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
      await recordLoanPayment({
        loanAccountId,
        fromAccountId,
        amount: parsedAmount,
        date,
        description: description || undefined,
      })
      toast.success("Loan payment recorded")
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
