"use client"

/**
 * Add/edit loan dialog form.
 *
 * Renders a Dialog with form fields for creating or editing a loan account.
 * In create mode, the user selects an account type (LOAN or MORTGAGE), loan type,
 * and fills in financial details. The balance defaults to the negative of the
 * original balance (since loans represent owed money).
 *
 * In edit mode, the account type selector is disabled and all fields are
 * pre-filled from the provided editData. On submit, calls createLoan() or
 * updateLoan() server actions atomically.
 *
 * Follows the same dialog pattern as AccountForm: controlled open/onOpenChange
 * props, onSuccess callback, and toast notifications for success/error.
 */

import { useState, useEffect } from "react"
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
import { ACCOUNT_TYPE_LABELS, LOAN_TYPE_LABELS, RECURRING_FREQUENCY_LABELS } from "@/lib/constants"
import type { AccountType, LoanType } from "@/lib/constants"
import { createLoan, updateLoan } from "@/actions/loans"

/** Shape of loan data passed to the form in edit mode. */
interface LoanEditData {
  id: string
  accountName: string
  loanType: string
  balance: number
  originalBalance: number
  interestRate: number
  termMonths: number
  startDate: Date
  monthlyPayment: number
  extraPaymentAmount: number
  paymentDueDay: number | null
  owner: string | null
  // BNPL-specific
  totalInstallments?: number | null
  completedInstallments?: number
  installmentFrequency?: string | null
  nextPaymentDate?: Date | null
  merchantName?: string | null
  paymentAccountId?: string | null
  // Payday-specific
  feePerHundred?: number | null
  termDays?: number | null
  dueDate?: Date | null
  lenderName?: string | null
}

interface LoanFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editData?: LoanEditData | null
  accounts?: { id: string; name: string }[] // for BNPL payment account selection
}

/**
 * Formats a Date or date-like value into a YYYY-MM-DD string for HTML date inputs.
 */
function toDateInputValue(date: Date | string): string {
  const d = new Date(date)
  return d.toISOString().split("T")[0]
}

export function LoanForm({ open, onOpenChange, onSuccess, editData, accounts = [] }: LoanFormProps) {
  const isEdit = !!editData

  // -- Form state --
  const [accountName, setAccountName] = useState("")
  const [accountType, setAccountType] = useState<"LOAN" | "MORTGAGE">("LOAN")
  const [loanType, setLoanType] = useState<LoanType>("PERSONAL")
  const [originalBalance, setOriginalBalance] = useState("")
  const [balance, setBalance] = useState("")
  const [interestRate, setInterestRate] = useState("")
  const [termMonths, setTermMonths] = useState("")
  const [startDate, setStartDate] = useState(toDateInputValue(new Date()))
  const [monthlyPayment, setMonthlyPayment] = useState("")
  const [extraPayment, setExtraPayment] = useState("0")
  const [paymentDueDay, setPaymentDueDay] = useState("")
  const [owner, setOwner] = useState("")
  const [saving, setSaving] = useState(false)
  // BNPL-specific state
  const [totalInstallments, setTotalInstallments] = useState("4")
  const [installmentFrequency, setInstallmentFrequency] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("BIWEEKLY")
  const [nextPaymentDate, setNextPaymentDate] = useState(toDateInputValue(new Date()))
  const [merchantName, setMerchantName] = useState("")
  const [paymentAccountId, setPaymentAccountId] = useState("")
  // Payday-specific state
  const [feePerHundred, setFeePerHundred] = useState("")
  const [termDays, setTermDays] = useState("14")
  const [lenderName, setLenderName] = useState("")

  const isBNPL = loanType === "BNPL"
  const isPayday = loanType === "PAYDAY"

  /**
   * Resets form fields when the dialog opens or editData changes.
   * In edit mode, pre-fills all fields from editData.
   * In create mode, resets to sensible defaults.
   */
  useEffect(() => {
    if (open) {
      if (editData) {
        setAccountName(editData.accountName)
        setLoanType(editData.loanType as LoanType)
        setOriginalBalance(editData.originalBalance.toString())
        setBalance(editData.balance.toString())
        setInterestRate(editData.interestRate.toString())
        setTermMonths(editData.termMonths.toString())
        setStartDate(toDateInputValue(editData.startDate))
        setMonthlyPayment(editData.monthlyPayment.toString())
        setExtraPayment(editData.extraPaymentAmount.toString())
        setPaymentDueDay(editData.paymentDueDay?.toString() ?? "")
        setOwner(editData.owner ?? "")
        // Infer account type from loan type
        setAccountType(editData.loanType === "MORTGAGE" ? "MORTGAGE" : "LOAN")
        // BNPL fields
        setTotalInstallments(editData.totalInstallments?.toString() ?? "4")
        setInstallmentFrequency((editData.installmentFrequency as "WEEKLY" | "BIWEEKLY" | "MONTHLY") ?? "BIWEEKLY")
        setNextPaymentDate(editData.nextPaymentDate ? toDateInputValue(editData.nextPaymentDate) : toDateInputValue(new Date()))
        setMerchantName(editData.merchantName ?? "")
        setPaymentAccountId(editData.paymentAccountId ?? "")
        // Payday fields
        setFeePerHundred(editData.feePerHundred?.toString() ?? "")
        setTermDays(editData.termDays?.toString() ?? "14")
        setLenderName(editData.lenderName ?? "")
      } else {
        setAccountName("")
        setAccountType("LOAN")
        setLoanType("PERSONAL")
        setOriginalBalance("")
        setBalance("")
        setInterestRate("")
        setTermMonths("")
        setStartDate(toDateInputValue(new Date()))
        setMonthlyPayment("")
        setExtraPayment("0")
        setPaymentDueDay("")
        setOwner("")
        setTotalInstallments("4")
        setInstallmentFrequency("BIWEEKLY")
        setNextPaymentDate(toDateInputValue(new Date()))
        setMerchantName("")
        setPaymentAccountId("")
        setFeePerHundred("")
        setTermDays("14")
        setLenderName("")
      }
    }
  }, [open, editData])

  /**
   * Auto-sync balance to negative of original balance in create mode.
   * When the user types an original balance, the current balance field
   * is set to the negated value (loans are owed money, stored as negative).
   */
  function handleOriginalBalanceChange(value: string) {
    setOriginalBalance(value)
    if (!isEdit) {
      const parsed = parseFloat(value)
      if (!isNaN(parsed)) {
        if (isPayday) {
          // Payday: balance = -(principal + fee)
          const fee = parseFloat(feePerHundred) || 0
          const totalFee = Math.abs(parsed) * (fee / 100)
          setBalance((-(Math.abs(parsed) + totalFee)).toString())
        } else {
          setBalance((-Math.abs(parsed)).toString())
        }
        // Auto-calc monthly payment for BNPL
        if (isBNPL) {
          const installments = parseInt(totalInstallments)
          if (!isNaN(installments) && installments > 0) {
            setMonthlyPayment((Math.abs(parsed) / installments).toFixed(2))
          }
        }
      } else {
        setBalance("")
      }
    }
  }

  /** Recalculate installment amount when total installments changes (BNPL) */
  function handleInstallmentsChange(value: string) {
    setTotalInstallments(value)
    if (isBNPL && !isEdit) {
      const installments = parseInt(value)
      const origBal = parseFloat(originalBalance)
      if (!isNaN(installments) && installments > 0 && !isNaN(origBal)) {
        setMonthlyPayment((Math.abs(origBal) / installments).toFixed(2))
      }
    }
  }

  /** Handles form submission for both create and edit modes. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!accountName.trim()) {
      toast.error("Account name is required")
      return
    }

    setSaving(true)
    try {
      if (isEdit && editData) {
        await updateLoan(editData.id, {
          name: accountName.trim(),
          owner: owner.trim() || undefined,
          loanType: loanType,
          interestRate: parseFloat(interestRate) || 0,
          termMonths: parseInt(termMonths) || 0,
          monthlyPayment: parseFloat(monthlyPayment) || 0,
          extraPaymentAmount: parseFloat(extraPayment) || 0,
          paymentDueDay: paymentDueDay ? parseInt(paymentDueDay) : null,
          ...(isBNPL ? {
            totalInstallments: parseInt(totalInstallments) || 4,
            installmentFrequency: installmentFrequency,
            nextPaymentDate: nextPaymentDate || null,
            merchantName: merchantName.trim() || undefined,
            paymentAccountId: paymentAccountId || null,
          } : {}),
          ...(isPayday ? {
            feePerHundred: parseFloat(feePerHundred) || 0,
            termDays: parseInt(termDays) || 14,
            lenderName: lenderName.trim() || undefined,
            paymentAccountId: paymentAccountId || null,
          } : {}),
        })
        toast.success("Loan updated")
      } else if (isPayday) {
        const origBal = parseFloat(originalBalance) || 0
        const feeRate = parseFloat(feePerHundred) || 0
        const days = parseInt(termDays) || 14
        const fee = origBal * (feeRate / 100)
        const totalOwed = origBal + fee

        await createLoan({
          name: accountName.trim(),
          type: "LOAN",
          balance: -totalOwed,
          owner: owner.trim() || undefined,
          loanType: "PAYDAY",
          originalBalance: origBal,
          interestRate: 0, // will be calculated server-side as equivalent APR
          termMonths: 1,
          startDate: startDate,
          monthlyPayment: totalOwed, // single balloon payment
          feePerHundred: feeRate,
          termDays: days,
          lenderName: lenderName.trim() || undefined,
          paymentAccountId: paymentAccountId || undefined,
        })
        toast.success("Payday loan created")
      } else if (isBNPL) {
        const origBal = parseFloat(originalBalance) || 0
        const installments = parseInt(totalInstallments) || 4
        // For BNPL, calculate termMonths from installments * frequency
        const freqMultiplier = installmentFrequency === "WEEKLY" ? 0.25 : installmentFrequency === "BIWEEKLY" ? 0.5 : 1
        const calcTermMonths = Math.ceil(installments * freqMultiplier)
        const installmentAmount = origBal / installments

        await createLoan({
          name: accountName.trim(),
          type: "LOAN",
          balance: -(origBal),
          owner: owner.trim() || undefined,
          loanType: "BNPL",
          originalBalance: origBal,
          interestRate: parseFloat(interestRate) || 0,
          termMonths: calcTermMonths,
          startDate: startDate,
          monthlyPayment: parseFloat(monthlyPayment) || installmentAmount,
          totalInstallments: installments,
          installmentFrequency: installmentFrequency,
          nextPaymentDate: nextPaymentDate,
          merchantName: merchantName.trim() || undefined,
          paymentAccountId: paymentAccountId || undefined,
        })
        toast.success("BNPL plan created")
      } else {
        const resolvedLoanType: LoanType = accountType === "MORTGAGE" ? "MORTGAGE" : loanType
        await createLoan({
          name: accountName.trim(),
          type: accountType,
          balance: parseFloat(balance) || 0,
          owner: owner.trim() || undefined,
          loanType: resolvedLoanType,
          originalBalance: parseFloat(originalBalance) || 0,
          interestRate: parseFloat(interestRate) || 0,
          termMonths: parseInt(termMonths) || 0,
          startDate: startDate,
          monthlyPayment: parseFloat(monthlyPayment) || 0,
          extraPaymentAmount: parseFloat(extraPayment) || 0,
          paymentDueDay: paymentDueDay ? parseInt(paymentDueDay) : undefined,
        })
        toast.success("Loan created")
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(isEdit ? "Failed to update loan" : "Failed to create loan")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  /** Filter ACCOUNT_TYPE_LABELS to only LOAN and MORTGAGE entries. */
  const loanAccountTypes = Object.entries(ACCOUNT_TYPE_LABELS).filter(
    ([value]) => value === "LOAN" || value === "MORTGAGE"
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Loan" : "Add Loan"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update loan details." : "Create a new loan or mortgage account."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="loan-name">Account Name</Label>
            <Input
              id="loan-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Home Mortgage"
            />
          </div>

          {/* Account Type: LOAN or MORTGAGE */}
          <div className="space-y-2">
            <Label htmlFor="loan-account-type">Account Type</Label>
            <Select
              value={accountType}
              onValueChange={(v) => {
                const next = v as "LOAN" | "MORTGAGE"
                setAccountType(next)
                if (next === "MORTGAGE") setLoanType("MORTGAGE")
                else if (loanType === "MORTGAGE") setLoanType("PERSONAL")
              }}
              disabled={isEdit}
            >
              <SelectTrigger id="loan-account-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {loanAccountTypes.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Loan Type: only shown for LOAN account type (MORTGAGE auto-sets) */}
          {accountType === "LOAN" && (
            <div className="space-y-2">
              <Label htmlFor="loan-type">Loan Type</Label>
              <Select
                value={loanType}
                onValueChange={(v) => setLoanType(v as LoanType)}
              >
                <SelectTrigger id="loan-type" className="w-full">
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

          {/* BNPL-specific fields */}
          {isBNPL && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">BNPL Details</p>

              <div className="space-y-2">
                <Label htmlFor="bnpl-merchant">Merchant / Description</Label>
                <Input
                  id="bnpl-merchant"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="e.g. PayPal - Nike Shoes"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bnpl-installments">Number of Installments</Label>
                <Input
                  id="bnpl-installments"
                  type="number"
                  min="2"
                  max="52"
                  value={totalInstallments}
                  onChange={(e) => handleInstallmentsChange(e.target.value)}
                  placeholder="4"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bnpl-frequency">Payment Frequency</Label>
                <Select
                  value={installmentFrequency}
                  onValueChange={(v) => setInstallmentFrequency(v as "WEEKLY" | "BIWEEKLY" | "MONTHLY")}
                >
                  <SelectTrigger id="bnpl-frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="BIWEEKLY">Biweekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bnpl-next-payment">First Payment Date</Label>
                <Input
                  id="bnpl-next-payment"
                  type="date"
                  value={nextPaymentDate}
                  onChange={(e) => setNextPaymentDate(e.target.value)}
                />
              </div>

              {accounts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="bnpl-payment-account">Payment Account</Label>
                  <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                    <SelectTrigger id="bnpl-payment-account" className="w-full">
                      <SelectValue placeholder="Select account for payments" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acct) => (
                        <SelectItem key={acct.id} value={acct.id}>
                          {acct.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Account payments will be drawn from
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Payday-specific fields */}
          {isPayday && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Payday Loan Details</p>

              <div className="space-y-2">
                <Label htmlFor="payday-fee">Fee per $100 Borrowed</Label>
                <Input
                  id="payday-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={feePerHundred}
                  onChange={(e) => {
                    setFeePerHundred(e.target.value)
                    // Recalculate balance when fee changes
                    if (!isEdit) {
                      const origBal = parseFloat(originalBalance) || 0
                      const fee = parseFloat(e.target.value) || 0
                      const totalFee = origBal * (fee / 100)
                      setBalance((-(origBal + totalFee)).toString())
                    }
                  }}
                  placeholder="e.g. 15.00"
                />
                <p className="text-muted-foreground text-xs">
                  Flat fee charged per $100 borrowed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payday-term">Term (days)</Label>
                <Input
                  id="payday-term"
                  type="number"
                  min="1"
                  max="60"
                  value={termDays}
                  onChange={(e) => setTermDays(e.target.value)}
                  placeholder="e.g. 14"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payday-lender">Lender Name (optional)</Label>
                <Input
                  id="payday-lender"
                  value={lenderName}
                  onChange={(e) => setLenderName(e.target.value)}
                  placeholder="e.g. QuickCash"
                />
              </div>

              {accounts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="payday-payment-account">Payment Account (optional)</Label>
                  <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                    <SelectTrigger id="payday-payment-account" className="w-full">
                      <SelectValue placeholder="Select account for repayment" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acct) => (
                        <SelectItem key={acct.id} value={acct.id}>
                          {acct.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Account the repayment will be drawn from on the due date
                  </p>
                </div>
              )}

              {/* Auto-calculated summary */}
              {parseFloat(originalBalance) > 0 && parseFloat(feePerHundred) > 0 && parseInt(termDays) > 0 && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium">Summary</p>
                  <p className="text-muted-foreground">
                    Fee: ${(parseFloat(originalBalance) * (parseFloat(feePerHundred) / 100)).toFixed(2)}
                    {" | "}
                    Total repayment: ${(parseFloat(originalBalance) + parseFloat(originalBalance) * (parseFloat(feePerHundred) / 100)).toFixed(2)}
                    {" | "}
                    Equivalent APR: {((parseFloat(feePerHundred) / 100) * (365 / parseInt(termDays)) * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Financial Details */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Financial Details</p>

            <div className="space-y-2">
              <Label htmlFor="loan-orig-balance">
                {isBNPL ? "Purchase Price" : isPayday ? "Amount Borrowed" : "Original Balance"}
              </Label>
              <Input
                id="loan-orig-balance"
                type="number"
                step="0.01"
                value={originalBalance}
                onChange={(e) => handleOriginalBalanceChange(e.target.value)}
                placeholder={isBNPL ? "e.g. 200.00" : "e.g. 250000"}
              />
            </div>

            {!isBNPL && !isPayday && (
              <div className="space-y-2">
                <Label htmlFor="loan-balance">Current Balance</Label>
                <Input
                  id="loan-balance"
                  type="number"
                  step="0.01"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Negative for owed money (auto-set from original balance in create mode)
                </p>
              </div>
            )}

            {!isPayday && (
            <div className="space-y-2">
              <Label htmlFor="loan-rate">Interest Rate / APR (%)</Label>
              <Input
                id="loan-rate"
                type="number"
                step="0.01"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder={isBNPL ? "0" : "e.g. 6.5"}
              />
              {isBNPL && (
                <p className="text-muted-foreground text-xs">
                  Most BNPL plans are 0% interest
                </p>
              )}
            </div>
            )}

            {!isBNPL && !isPayday && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="loan-term">Term (months)</Label>
                  <Input
                    id="loan-term"
                    type="number"
                    value={termMonths}
                    onChange={(e) => setTermMonths(e.target.value)}
                    placeholder="e.g. 360"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-start-date">Start Date</Label>
                  <Input
                    id="loan-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-monthly">Monthly Payment</Label>
                  <Input
                    id="loan-monthly"
                    type="number"
                    step="0.01"
                    value={monthlyPayment}
                    onChange={(e) => setMonthlyPayment(e.target.value)}
                    placeholder="e.g. 1580.17"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-extra">Extra Payment (optional)</Label>
                  <Input
                    id="loan-extra"
                    type="number"
                    step="0.01"
                    value={extraPayment}
                    onChange={(e) => setExtraPayment(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-due-day">Payment Due Day (optional)</Label>
                  <Input
                    id="loan-due-day"
                    type="number"
                    min="1"
                    max="31"
                    value={paymentDueDay}
                    onChange={(e) => setPaymentDueDay(e.target.value)}
                    placeholder="e.g. 15"
                  />
                  <p className="text-muted-foreground text-xs">
                    Day of month the payment is due (1-31)
                  </p>
                </div>
              </>
            )}

            {isBNPL && (
              <div className="space-y-2">
                <Label htmlFor="bnpl-installment-amount">Installment Amount</Label>
                <Input
                  id="bnpl-installment-amount"
                  type="number"
                  step="0.01"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  readOnly={!isEdit}
                />
                <p className="text-muted-foreground text-xs">
                  Auto-calculated from purchase price / installments
                </p>
              </div>
            )}
          </div>

          {/* Owner */}
          <div className="space-y-2">
            <Label htmlFor="loan-owner">Owner (optional)</Label>
            <Input
              id="loan-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g. John"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Loan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
