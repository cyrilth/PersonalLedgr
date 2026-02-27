"use client"

/**
 * Calendar page — shows all payment obligations (bills, loans, credit cards)
 * on a monthly calendar with click-to-view details and record payment actions.
 */

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FullCalendar } from "@/components/calendar/full-calendar"
import { PaymentDialog } from "@/components/recurring/payment-dialog"
import { getCalendarItems, type CalendarItem } from "@/actions/calendar"
import { getAccountsFlat } from "@/actions/accounts"

export default function CalendarPage() {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-indexed
  const [year, setYear] = useState(today.getFullYear())
  const [items, setItems] = useState<CalendarItem[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentBill, setPaymentBill] = useState<{
    id: string
    name: string
    amount: number
    isVariableAmount: boolean
    accountId: string
    accountName: string
  } | null>(null)
  const [paymentMonth, setPaymentMonth] = useState(month)
  const [paymentYear, setPaymentYear] = useState(year)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [calendarItems, accountsData] = await Promise.all([
        getCalendarItems(month, year),
        getAccountsFlat(),
      ])
      setItems(calendarItems)
      setAccounts(
        accountsData.map((a: { id: string; name: string }) => ({
          id: a.id,
          name: a.name,
        }))
      )
    } catch (err) {
      console.error("Failed to load calendar data:", err)
      toast.error("Failed to load calendar data")
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function handleMonthChange(newMonth: number, newYear: number) {
    setMonth(newMonth)
    setYear(newYear)
  }

  function handleRecordPayment(item: CalendarItem) {
    if (!item.billId) return
    setPaymentBill({
      id: item.billId,
      name: item.name,
      amount: item.amount,
      isVariableAmount: item.isVariableAmount,
      accountId: item.accountId,
      accountName: item.accountName,
    })
    setPaymentMonth(month)
    setPaymentYear(year)
    setPaymentDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>

      {loading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-6 w-6" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-6" />
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-md" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <FullCalendar
          items={items}
          month={month}
          year={year}
          onMonthChange={handleMonthChange}
          onRecordPayment={handleRecordPayment}
        />
      )}

      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={fetchData}
        bill={paymentBill}
        month={paymentMonth}
        year={paymentYear}
        accounts={accounts}
      />
    </div>
  )
}
