"use client"

/**
 * Tabbed "Add Transaction" dialog.
 *
 * Tabs: Expense | Income | Transfer | Loan Payment
 * - Expense/Income: standard form (account, amount, date, description, category, notes,
 *   optional APR rate for credit card expenses).
 * - Transfer: delegates to TransferWizard.
 * - Loan Payment: delegates to LoanPaymentForm.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { TransferWizard } from "./transfer-wizard"
import { LoanPaymentForm } from "./loan-payment-form"
import { createTransaction } from "@/actions/transactions"
import { getAprRates } from "@/actions/apr-rates"

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

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  accounts: AccountOption[]
  loanAccounts: LoanAccountOption[]
  categories?: string[]
}

interface AprRate {
  id: string
  rateType: string
  apr: number
  description: string | null
}

export function TransactionForm({
  open,
  onOpenChange,
  onSuccess,
  accounts,
  loanAccounts,
  categories = [],
}: TransactionFormProps) {
  const [tab, setTab] = useState<string>("expense")
  const [transferOpen, setTransferOpen] = useState(false)
  const [loanPaymentOpen, setLoanPaymentOpen] = useState(false)

  // Standard form state (Expense/Income)
  const [accountId, setAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [notes, setNotes] = useState("")
  const [aprRateId, setAprRateId] = useState("")
  const [aprRates, setAprRates] = useState<AprRate[]>([])
  const [saving, setSaving] = useState(false)

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isCreditCard = selectedAccount?.type === "CREDIT_CARD"

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setAccountId("")
      setAmount("")
      setDate(new Date().toISOString().split("T")[0])
      setDescription("")
      setCategory("")
      setNotes("")
      setAprRateId("")
      setAprRates([])
    }
  }, [open])

  // Fetch APR rates when a credit card is selected on Expense tab
  useEffect(() => {
    if (isCreditCard && tab === "expense") {
      getAprRates(accountId)
        .then(setAprRates)
        .catch(() => setAprRates([]))
    } else {
      setAprRates([])
      setAprRateId("")
    }
  }, [accountId, isCreditCard, tab])

  function formatAccountLabel(account: AccountOption) {
    return account.owner ? `${account.name} (${account.owner})` : account.name
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsedAmount = parseFloat(amount)
    if (!accountId) {
      toast.error("Please select an account")
      return
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Amount must be greater than zero")
      return
    }
    if (!description.trim()) {
      toast.error("Please enter a description")
      return
    }

    const type = tab === "income" ? "INCOME" : "EXPENSE"
    // Expenses are stored as negative, income as positive
    const signedAmount = type === "EXPENSE" ? -Math.abs(parsedAmount) : Math.abs(parsedAmount)

    setSaving(true)
    try {
      await createTransaction({
        date,
        description: description.trim(),
        amount: signedAmount,
        type,
        category: category || undefined,
        notes: notes.trim() || undefined,
        accountId,
        aprRateId: isCreditCard && aprRateId ? aprRateId : undefined,
      })
      toast.success(`${type === "INCOME" ? "Income" : "Expense"} recorded`)
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create transaction")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  function handleTransferSuccess() {
    setTransferOpen(false)
    onSuccess()
    onOpenChange(false)
  }

  function handleLoanPaymentSuccess() {
    setLoanPaymentOpen(false)
    onSuccess()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Record a new transaction, transfer, or loan payment.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">Expense</TabsTrigger>
              <TabsTrigger value="income" className="flex-1">Income</TabsTrigger>
              <TabsTrigger value="transfer" className="flex-1">Transfer</TabsTrigger>
              <TabsTrigger value="loan" className="flex-1">Loan Payment</TabsTrigger>
            </TabsList>

            {/* Expense / Income form */}
            {(tab === "expense" || tab === "income") && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="txn-account">Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="txn-account" className="w-full">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {formatAccountLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="txn-amount">Amount</Label>
                    <Input
                      id="txn-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="txn-date">Date</Label>
                    <Input
                      id="txn-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="txn-description">Description</Label>
                  <Input
                    id="txn-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Grocery store"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="txn-category">Category</Label>
                  <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
                    <SelectTrigger id="txn-category" className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* APR Rate selector for CC expense */}
                {isCreditCard && tab === "expense" && aprRates.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="txn-apr">APR Rate</Label>
                    <Select value={aprRateId || "none"} onValueChange={(v) => setAprRateId(v === "none" ? "" : v)}>
                      <SelectTrigger id="txn-apr" className="w-full">
                        <SelectValue placeholder="Default rate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default</SelectItem>
                        {aprRates.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.description || r.rateType} — {(r.apr * 100).toFixed(2)}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="txn-notes">Notes (optional)</Label>
                  <Input
                    id="txn-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional details..."
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : tab === "income" ? "Add Income" : "Add Expense"}
                  </Button>
                </DialogFooter>
              </form>
            )}

            {/* Transfer tab */}
            <TabsContent value="transfer" className="mt-4">
              <div className="space-y-4 text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Move money between your accounts. Both sides are recorded automatically.
                </p>
                <Button onClick={() => { onOpenChange(false); setTransferOpen(true) }}>
                  Open Transfer Wizard
                </Button>
              </div>
            </TabsContent>

            {/* Loan Payment tab */}
            <TabsContent value="loan" className="mt-4">
              <div className="space-y-4 text-center py-4">
                {loanAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No loan accounts found. Add a loan or mortgage account first.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Record a payment from one of your accounts to a loan. Interest and principal are split automatically.
                    </p>
                    <Button onClick={() => { onOpenChange(false); setLoanPaymentOpen(true) }}>
                      Open Loan Payment Form
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <TransferWizard
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onSuccess={handleTransferSuccess}
        accounts={accounts}
      />

      <LoanPaymentForm
        open={loanPaymentOpen}
        onOpenChange={setLoanPaymentOpen}
        onSuccess={handleLoanPaymentSuccess}
        accounts={accounts.filter((a) => !["LOAN", "MORTGAGE"].includes(a.type))}
        loanAccounts={loanAccounts}
      />
    </>
  )
}
