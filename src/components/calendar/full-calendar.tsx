"use client"

/**
 * Full-page calendar component showing all payment obligations (bills, loans, CCs).
 *
 * Color-coded dots by type: emerald=bills, blue=loans, purple=credit cards.
 * Clicking a day shows a detail panel in a separate card below.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Receipt,
  HandCoins,
  CreditCard,
  CalendarDays,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CalendarItem } from "@/actions/calendar"

interface FullCalendarProps {
  items: CalendarItem[]
  month: number // 1-indexed
  year: number
  onMonthChange: (month: number, year: number) => void
  onRecordPayment: (item: CalendarItem) => void
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const TYPE_COLORS = {
  bill: "bg-emerald-500",
  loan: "bg-blue-500",
  credit_card: "bg-purple-500",
} as const

const TYPE_TEXT_COLORS = {
  bill: "text-emerald-500",
  loan: "text-blue-500",
  credit_card: "text-purple-500",
} as const

const TYPE_ICONS = {
  bill: Receipt,
  loan: HandCoins,
  credit_card: CreditCard,
} as const

const TYPE_LABELS = {
  bill: "Bill",
  loan: "Loan",
  credit_card: "Credit Card",
} as const

export function FullCalendar({
  items,
  month,
  year,
  onMonthChange,
  onRecordPayment,
}: FullCalendarProps) {
  const router = useRouter()
  const today = new Date()
  const [selectedDay, setSelectedDay] = useState<number | null>(
    month === today.getMonth() + 1 && year === today.getFullYear()
      ? today.getDate()
      : null
  )

  // Build lookup: day -> items
  const itemsByDay = new Map<number, CalendarItem[]>()
  for (const item of items) {
    const existing = itemsByDay.get(item.day) ?? []
    existing.push(item)
    itemsByDay.set(item.day, existing)
  }

  // Calendar math
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate()

  const isToday = (day: number) =>
    day === today.getDate() &&
    month === today.getMonth() + 1 &&
    year === today.getFullYear()

  // Build cells
  const cells: { day: number; inMonth: boolean }[] = []
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true })
  }
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, inMonth: false })
    }
  }

  function goToPrevMonth() {
    if (month === 1) {
      onMonthChange(12, year - 1)
    } else {
      onMonthChange(month - 1, year)
    }
    setSelectedDay(null)
  }

  function goToNextMonth() {
    if (month === 12) {
      onMonthChange(1, year + 1)
    } else {
      onMonthChange(month + 1, year)
    }
    setSelectedDay(null)
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const selectedItems = selectedDay ? itemsByDay.get(selectedDay) ?? [] : []
  const selectedDateLabel = selectedDay
    ? new Date(year, month - 1, selectedDay).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null

  // Summary counts for the month
  const totalDue = items.length
  const totalPaid = items.filter((i) => i.isPaid).length
  const totalUnpaid = totalDue - totalPaid

  function handleItemAction(item: CalendarItem) {
    if (item.type === "bill") {
      onRecordPayment(item)
    } else if (item.type === "loan" && item.loanId) {
      router.push(`/loans/${item.loanId}`)
    } else if (item.type === "credit_card") {
      router.push(`/accounts/${item.accountId}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Calendar Card */}
      <Card>
        <CardContent className="pt-6">
          {/* Month/Year header */}
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="rounded-md p-2 hover:bg-muted transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-semibold">{monthLabel}</h2>
            <button
              type="button"
              onClick={goToNextMonth}
              className="rounded-md p-2 hover:bg-muted transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Legend + summary */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Bills
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                Loans
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500" />
                Credit Cards
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{totalDue} due</span>
              <span className="text-emerald-500">{totalPaid} paid</span>
              {totalUnpaid > 0 && (
                <span className="text-amber-500">{totalUnpaid} unpaid</span>
              )}
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b pb-2 text-center">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              const dayItems = cell.inMonth
                ? itemsByDay.get(cell.day)
                : undefined
              const hasItems = dayItems && dayItems.length > 0
              const isSelected = cell.inMonth && cell.day === selectedDay
              const allPaid = hasItems && dayItems.every((i) => i.isPaid)

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!cell.inMonth}
                  onClick={() => cell.inMonth && setSelectedDay(cell.day)}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 border-b text-sm transition-colors",
                    !cell.inMonth && "opacity-20",
                    cell.inMonth && "hover:bg-muted/50 cursor-pointer",
                    cell.inMonth &&
                      isToday(cell.day) &&
                      !isSelected &&
                      "bg-emerald-500/10",
                    isSelected && "bg-primary/10"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                      cell.inMonth && isToday(cell.day) && "bg-emerald-500 text-white font-semibold",
                      isSelected && !isToday(cell.day) && "bg-primary text-primary-foreground font-semibold"
                    )}
                  >
                    {cell.day}
                  </span>
                  {hasItems && (
                    <div className="flex gap-0.5">
                      {Array.from(new Set(dayItems.map((i) => i.type))).map(
                        (type) => (
                          <span
                            key={type}
                            className={cn(
                              "inline-block h-1.5 w-1.5 rounded-full",
                              allPaid ? "opacity-40" : "",
                              TYPE_COLORS[type]
                            )}
                          />
                        )
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Detail Card */}
      {selectedDay !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {selectedDateLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No payments due on this day.
              </p>
            ) : (
              <div className="divide-y">
                {selectedItems.map((item) => {
                  const Icon = TYPE_ICONS[item.type]
                  return (
                    <div
                      key={item.obligationId}
                      className={cn(
                        "flex items-center gap-4 py-3",
                        item.isPaid && "opacity-60"
                      )}
                    >
                      {/* Status icon */}
                      {item.isPaid ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      )}

                      {/* Type color bar */}
                      <div
                        className={cn(
                          "h-8 w-1 shrink-0 rounded-full",
                          TYPE_COLORS[item.type]
                        )}
                      />

                      {/* Name + type */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate font-medium text-sm",
                              item.isPaid && "line-through"
                            )}
                          >
                            {item.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0 border-0 px-1.5",
                              TYPE_TEXT_COLORS[item.type],
                              `bg-current/10`
                            )}
                          >
                            <Icon className="mr-1 h-3 w-3" />
                            {TYPE_LABELS[item.type]}
                          </Badge>
                        </div>
                        {item.isPaid && (
                          <p className="mt-0.5 text-xs text-emerald-500">
                            Paid {formatCurrency(item.paidAmount)}
                          </p>
                        )}
                      </div>

                      {/* Amount */}
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums shrink-0",
                          item.isPaid
                            ? "text-muted-foreground"
                            : "text-foreground"
                        )}
                      >
                        {formatCurrency(item.amount)}
                      </span>

                      {/* Action button */}
                      {!item.isPaid && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => handleItemAction(item)}
                        >
                          {item.type === "bill"
                            ? "Record Payment"
                            : item.type === "loan"
                              ? "View Loan"
                              : "View Card"}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
