"use client"

/**
 * Month-view calendar showing which days recurring bills are due.
 *
 * Renders a compact grid calendar with colored dot indicators for each bill:
 * green dots for fixed-amount bills, amber dots for variable-amount bills.
 * Supports month navigation via arrow buttons and highlights today's date.
 */

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface BillsCalendarProps {
  bills: {
    id: string
    name: string
    amount: number
    dayOfMonth: number
    isVariableAmount: boolean
  }[]
  month?: number // 0-indexed month (default: current month)
  year?: number // (default: current year)
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function BillsCalendar({ bills, month, year }: BillsCalendarProps) {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(month ?? today.getMonth())
  const [currentYear, setCurrentYear] = useState(year ?? today.getFullYear())

  // Build a lookup: dayOfMonth -> bills due that day
  const billsByDay = new Map<number, typeof bills>()
  for (const bill of bills) {
    const existing = billsByDay.get(bill.dayOfMonth) ?? []
    existing.push(bill)
    billsByDay.set(bill.dayOfMonth, existing)
  }

  // Calendar math
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear()

  // Build cells: previous month padding + current month + next month padding
  const cells: { day: number; inMonth: boolean }[] = []

  // Previous month padding
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true })
  }

  // Next month padding to fill remaining row
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, inMonth: false })
    }
  }

  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  )

  return (
    <div className="w-full">
      {/* Month/Year header with navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="rounded p-1 hover:bg-muted"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="rounded p-1 hover:bg-muted"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px text-center">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="pb-1 text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((cell, idx) => {
          const dayBills = cell.inMonth ? billsByDay.get(cell.day) : undefined
          const hasBills = dayBills && dayBills.length > 0
          const titleText = hasBills
            ? dayBills.map((b) => `${b.name} ($${b.amount.toFixed(2)})`).join(", ")
            : undefined

          return (
            <div
              key={idx}
              title={titleText}
              className={cn(
                "flex h-10 flex-col items-center justify-center gap-0.5 rounded text-xs",
                !cell.inMonth && "opacity-30",
                cell.inMonth && isToday(cell.day) && "ring-2 ring-emerald-500"
              )}
            >
              <span>{cell.day}</span>
              {hasBills && (
                <div className="flex gap-0.5">
                  {dayBills.map((bill) => (
                    <span
                      key={bill.id}
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        bill.isVariableAmount
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
