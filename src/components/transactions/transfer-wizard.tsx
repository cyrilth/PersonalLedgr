"use client"

/**
 * Transfer wizard dialog for moving money between accounts.
 *
 * Creates a linked pair of TRANSFER transactions via the createTransfer()
 * server action. Auto-generates a description like "Transfer: Checking → Savings"
 * that can be edited before submission.
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
import { createTransfer } from "@/actions/transfers"

interface AccountOption {
  id: string
  name: string
  type: string
  owner: string | null
  balance: number
}

interface TransferWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  accounts: AccountOption[]
}

export function TransferWizard({ open, onOpenChange, onSuccess, accounts }: TransferWizardProps) {
  const [fromAccountId, setFromAccountId] = useState("")
  const [toAccountId, setToAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  // Auto-generate description when accounts change (unless user has edited it)
  useEffect(() => {
    if (descriptionTouched) return
    const from = accounts.find((a) => a.id === fromAccountId)
    const to = accounts.find((a) => a.id === toAccountId)
    if (from && to) {
      setDescription(`Transfer: ${from.name} → ${to.name}`)
    } else {
      setDescription("")
    }
  }, [fromAccountId, toAccountId, accounts, descriptionTouched])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFromAccountId("")
      setToAccountId("")
      setAmount("")
      setDate(new Date().toISOString().split("T")[0])
      setDescription("")
      setDescriptionTouched(false)
    }
  }, [open])

  function formatAccountLabel(account: AccountOption) {
    return account.owner ? `${account.name} (${account.owner})` : account.name
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsedAmount = parseFloat(amount)

    if (!fromAccountId || !toAccountId) {
      toast.error("Please select both accounts")
      return
    }
    if (fromAccountId === toAccountId) {
      toast.error("Source and destination must be different accounts")
      return
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Amount must be greater than zero")
      return
    }

    setSaving(true)
    try {
      await createTransfer({
        fromAccountId,
        toAccountId,
        amount: parsedAmount,
        date,
        description: description || `Transfer: ${fromAccountId} → ${toAccountId}`,
      })
      toast.success("Transfer created")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create transfer")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Between Accounts</DialogTitle>
          <DialogDescription>
            Move money between your accounts. Both sides are recorded automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="to-account">To Account</Label>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger id="to-account" className="w-full">
                <SelectValue placeholder="Select destination account" />
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
            <Label htmlFor="transfer-amount">Amount</Label>
            <Input
              id="transfer-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-date">Date</Label>
            <Input
              id="transfer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-description">Description</Label>
            <Input
              id="transfer-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setDescriptionTouched(true)
              }}
              placeholder="Transfer: Account A → Account B"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Transferring..." : "Create Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
