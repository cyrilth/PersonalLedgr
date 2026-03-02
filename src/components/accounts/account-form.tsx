"use client"

/**
 * Add/edit account dialog form.
 *
 * Renders a Dialog with form fields that adapt based on the selected account type:
 * - Base fields (all types): name, type, balance, owner
 * - Credit Card: credit limit, statement close day, payment due day, grace period
 * - Loan: loan type (Auto/Student/Personal), original balance, interest rate, term, etc.
 * - Mortgage: same as loan but auto-sets loan type to MORTGAGE and hides the selector
 *
 * In edit mode, the type selector is disabled (type cannot change after creation).
 * On submit, calls createAccount() or updateAccount() server actions.
 */

import { useState } from "react"
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
import { ACCOUNT_TYPE_LABELS, LOAN_TYPE_LABELS } from "@/lib/constants"
import type { AccountType, LoanType } from "@/lib/constants"
import { createAccount, updateAccount } from "@/actions/accounts"

/** Shape of account data passed to the form in edit mode. */
interface AccountData {
  id: string
  name: string
  type: string
  balance: number
  creditLimit: number | null
  owner: string | null
  apy: number
  creditCardDetails?: {
    statementCloseDay: number
    paymentDueDay: number
    gracePeriodDays: number
  } | null
  loan?: {
    loanType: string
    originalBalance: number
    interestRate: number
    termMonths: number
    startDate: Date | string
    monthlyPayment: number
    extraPaymentAmount: number
  } | null
  termMonths?: number | null
  maturityDate?: Date | string | null
  autoRenew?: boolean
}

interface AccountFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: AccountData | null
  onSuccess: () => void
}

export function AccountForm({ open, onOpenChange, account, onSuccess }: AccountFormProps) {
  const isEdit = !!account

  const [name, setName] = useState(account?.name ?? "")
  const [type, setType] = useState<AccountType>((account?.type as AccountType) ?? "CHECKING")
  const [balance, setBalance] = useState(account?.balance?.toString() ?? "0")
  const [owner, setOwner] = useState(account?.owner ?? "")
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit?.toString() ?? "")

  // CC fields
  const [statementCloseDay, setStatementCloseDay] = useState(
    account?.creditCardDetails?.statementCloseDay?.toString() ?? "15"
  )
  const [paymentDueDay, setPaymentDueDay] = useState(
    account?.creditCardDetails?.paymentDueDay?.toString() ?? "10"
  )
  const [gracePeriodDays, setGracePeriodDays] = useState(
    account?.creditCardDetails?.gracePeriodDays?.toString() ?? "25"
  )
  const [apy, setApy] = useState(account?.apy?.toString() ?? "")
  const [purchaseApr, setPurchaseApr] = useState("")

  // Loan fields
  const [loanType, setLoanType] = useState<LoanType>(
    (account?.loan?.loanType as LoanType) ?? "PERSONAL"
  )
  const [originalBalance, setOriginalBalance] = useState(
    account?.loan?.originalBalance?.toString() ?? ""
  )
  const [interestRate, setInterestRate] = useState(
    account?.loan?.interestRate?.toString() ?? ""
  )
  const [termMonths, setTermMonths] = useState(
    account?.loan?.termMonths?.toString() ?? ""
  )
  const [startDate, setStartDate] = useState(() => {
    if (account?.loan?.startDate) {
      const d = new Date(account.loan.startDate)
      return d.toISOString().split("T")[0]
    }
    return new Date().toISOString().split("T")[0]
  })
  const [monthlyPayment, setMonthlyPayment] = useState(
    account?.loan?.monthlyPayment?.toString() ?? ""
  )
  const [extraPayment, setExtraPayment] = useState(
    account?.loan?.extraPaymentAmount?.toString() ?? "0"
  )

  // CD fields
  const [cdTermMonths, setCdTermMonths] = useState(account?.termMonths?.toString() ?? "12")
  const [cdMaturityDate, setCdMaturityDate] = useState(() => {
    if (account?.maturityDate) {
      const d = new Date(account.maturityDate)
      return d.toISOString().split("T")[0]
    }
    return ""
  })
  const [cdAutoRenew, setCdAutoRenew] = useState(account?.autoRenew ?? false)

  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens with different account
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onOpenChange(false)
      return
    }
    onOpenChange(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Account name is required")
      return
    }

    setSaving(true)
    try {
      const baseData = {
        name: name.trim(),
        balance: parseFloat(balance) || 0,
        owner: owner.trim() || undefined,
        apy: type === "SAVINGS" || type === "CHECKING" || type === "CD" ? (apy ? parseFloat(apy) : undefined) : undefined,
        creditLimit: type === "CREDIT_CARD" ? parseFloat(creditLimit) || undefined : undefined,
        creditCard:
          type === "CREDIT_CARD"
            ? {
                statementCloseDay: parseInt(statementCloseDay) || 15,
                paymentDueDay: parseInt(paymentDueDay) || 10,
                gracePeriodDays: parseInt(gracePeriodDays) || 25,
                purchaseApr: purchaseApr ? parseFloat(purchaseApr) : undefined,
              }
            : undefined,
        loan:
          type === "LOAN" || type === "MORTGAGE"
            ? {
                loanType: type === "MORTGAGE" ? "MORTGAGE" : loanType,
                originalBalance: parseFloat(originalBalance) || 0,
                interestRate: parseFloat(interestRate) || 0,
                termMonths: parseInt(termMonths) || 0,
                startDate: startDate,
                monthlyPayment: parseFloat(monthlyPayment) || 0,
                extraPaymentAmount: parseFloat(extraPayment) || 0,
              }
            : undefined,
        cd:
          type === "CD"
            ? {
                termMonths: parseInt(cdTermMonths) || 12,
                maturityDate: cdMaturityDate,
                autoRenew: cdAutoRenew,
              }
            : undefined,
      }

      if (isEdit && account) {
        await updateAccount(account.id, baseData)
        toast.success("Account updated")
      } else {
        await createAccount({ ...baseData, type })
        toast.success("Account created")
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(isEdit ? "Failed to update account" : "Failed to create account")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const days = Array.from({ length: 28 }, (_, i) => i + 1)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Account" : "Add Account"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update account details." : "Create a new financial account."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Base fields */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Checking"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                const next = v as AccountType
                setType(next)
                if (next === "MORTGAGE") setLoanType("MORTGAGE")
                else if (next === "LOAN" && loanType === "MORTGAGE") setLoanType("PERSONAL")
              }}
              disabled={isEdit}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="balance">Balance</Label>
            <Input
              id="balance"
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
            {["CREDIT_CARD", "LOAN", "MORTGAGE"].includes(type) && (
              <p className="text-xs text-muted-foreground">
                Enter as a positive number — it will be stored as a negative (debt) balance.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner">Owner (optional)</Label>
            <Input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g. John"
            />
          </div>

          {/* APY field for Savings/Checking/CD */}
          {(type === "SAVINGS" || type === "CHECKING" || type === "CD") && (
            <div className="space-y-2">
              <Label htmlFor="apy">Annual Percentage Yield (APY %)</Label>
              <Input
                id="apy"
                type="number"
                step="0.01"
                value={apy}
                onChange={(e) => setApy(e.target.value)}
                placeholder="e.g. 4.50"
              />
            </div>
          )}

          {/* Credit Card fields */}
          {type === "CREDIT_CARD" && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Credit Card Details</p>

              <div className="space-y-2">
                <Label htmlFor="creditLimit">Credit Limit</Label>
                <Input
                  id="creditLimit"
                  type="number"
                  step="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closeDay">Statement Close Day</Label>
                <Select value={statementCloseDay} onValueChange={setStatementCloseDay}>
                  <SelectTrigger id="closeDay" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((d) => (
                      <SelectItem key={d} value={d.toString()}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDay">Payment Due Day</Label>
                <Select value={paymentDueDay} onValueChange={setPaymentDueDay}>
                  <SelectTrigger id="dueDay" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((d) => (
                      <SelectItem key={d} value={d.toString()}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grace">Grace Period (days)</Label>
                <Input
                  id="grace"
                  type="number"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchaseApr">Purchase APR (%)</Label>
                <Input
                  id="purchaseApr"
                  type="number"
                  step="0.01"
                  value={purchaseApr}
                  onChange={(e) => setPurchaseApr(e.target.value)}
                  placeholder="e.g. 24.99"
                />
              </div>
            </div>
          )}

          {/* Loan fields */}
          {(type === "LOAN" || type === "MORTGAGE") && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">
                {type === "MORTGAGE" ? "Mortgage Details" : "Loan Details"}
              </p>

              {type === "LOAN" && (
                <div className="space-y-2">
                  <Label htmlFor="loanType">Loan Type</Label>
                  <Select value={loanType} onValueChange={(v) => setLoanType(v as LoanType)}>
                    <SelectTrigger id="loanType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LOAN_TYPE_LABELS)
                        .filter(([value]) => value !== "MORTGAGE")
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="origBalance">Original Balance</Label>
                <Input
                  id="origBalance"
                  type="number"
                  step="0.01"
                  value={originalBalance}
                  onChange={(e) => setOriginalBalance(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">Interest Rate (%)</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.01"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="term">Term (months)</Label>
                <Input
                  id="term"
                  type="number"
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthly">Monthly Payment</Label>
                <Input
                  id="monthly"
                  type="number"
                  step="0.01"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extra">Extra Payment</Label>
                <Input
                  id="extra"
                  type="number"
                  step="0.01"
                  value={extraPayment}
                  onChange={(e) => setExtraPayment(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* CD fields */}
          {type === "CD" && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">CD Details</p>

              <div className="space-y-2">
                <Label htmlFor="cdTerm">Term (months)</Label>
                <Input
                  id="cdTerm"
                  type="number"
                  value={cdTermMonths}
                  onChange={(e) => setCdTermMonths(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cdMaturity">Maturity Date</Label>
                <Input
                  id="cdMaturity"
                  type="date"
                  value={cdMaturityDate}
                  onChange={(e) => setCdMaturityDate(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="cdAutoRenew"
                  type="checkbox"
                  checked={cdAutoRenew}
                  onChange={(e) => setCdAutoRenew(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="cdAutoRenew">Auto-renew at maturity</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
