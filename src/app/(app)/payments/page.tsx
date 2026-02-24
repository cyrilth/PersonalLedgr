"use client"

/**
 * Payment Tracker page — unified view of all payment obligations.
 *
 * Shows a Jan–Dec grid with sections for Bills, Loans, and Credit Cards.
 * Bill cells open the payment dialog; loan/CC cells navigate to their detail pages.
 */

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { PaymentTrackerGrid } from "@/components/payments/payment-tracker-grid"
import {
  getPaymentObligations,
  type PaymentObligation,
} from "@/actions/payment-tracker"
import { getAccountsFlat } from "@/actions/accounts"

function PaymentsSkeleton() {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-7" />
            <div className="flex flex-1 gap-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-6 flex-1" />
              ))}
            </div>
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-32" />
              <div className="flex flex-1 gap-1">
                {Array.from({ length: 12 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 flex-1" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function PaymentsPage() {
  const [obligations, setObligations] = useState<PaymentObligation[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [obligationsData, accountsData] = await Promise.all([
        getPaymentObligations(),
        getAccountsFlat(),
      ])
      setObligations(obligationsData)
      setAccounts(accountsData.map((a: { id: string; name: string }) => ({
        id: a.id,
        name: a.name,
      })))
    } catch (err) {
      console.error("Failed to load payment data:", err)
      toast.error("Failed to load payment data")
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
        <h1 className="text-2xl font-bold tracking-tight">Payment Tracker</h1>
      </div>

      {loading ? (
        <PaymentsSkeleton />
      ) : (
        <PaymentTrackerGrid obligations={obligations} accounts={accounts} />
      )}
    </div>
  )
}
