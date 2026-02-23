"use client"

/**
 * Accounts list page — displays all active accounts grouped by type.
 *
 * Groups are ordered: Checking → Savings → Credit Card → Loan → Mortgage,
 * each with a heading showing the group total. Account cards link to their
 * detail pages. Includes an "Add Account" button that opens the account form
 * dialog, skeleton loading state, and an empty state prompt.
 */

import { useEffect, useState, useCallback } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AccountCard } from "@/components/accounts/account-card"
import { AccountForm } from "@/components/accounts/account-form"
import { getAccounts } from "@/actions/accounts"
import { formatCurrency } from "@/lib/utils"

type AccountGroups = Awaited<ReturnType<typeof getAccounts>>

/** Skeleton placeholder shown while account data is loading. */
function AccountsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((g) => (
        <div key={g} className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AccountsPage() {
  const [groups, setGroups] = useState<AccountGroups | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAccounts()
      setGroups(data)
    } catch (err) {
      console.error("Failed to load accounts:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Button onClick={() => setFormOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {loading ? (
        <AccountsSkeleton />
      ) : !groups || groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">
            No accounts yet. Add your first account to get started.
          </p>
          <Button onClick={() => setFormOpen(true)} variant="outline" className="mt-4">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Account
          </Button>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.type} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {group.label}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({formatCurrency(Math.abs(group.total))})
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.accounts.map((account) => (
                <AccountCard key={account.id} {...account} />
              ))}
            </div>
          </div>
        ))
      )}

      <AccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchData}
      />
    </div>
  )
}
