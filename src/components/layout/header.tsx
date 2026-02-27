"use client"

/**
 * App header — displays the current page title and the global year picker.
 *
 * Page title is derived from the current pathname using a lookup table.
 * The year picker (right-aligned) lets users scope all views to a calendar year,
 * with range extending back to the user's earliest transaction.
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { useYear } from "@/contexts/year-context"
import { getEarliestTransactionYear } from "@/actions/transactions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/accounts": "Accounts",
  "/loans": "Loans",
  "/recurring": "Recurring Bills",
  "/budgets": "Budgets",
  "/reports": "Reports",
  "/import": "Import",
  "/settings": "Settings",
  "/profile": "Profile",
  "/guide": "Getting Started",
}

const currentYear = new Date().getFullYear()
const defaultYearOptions = Array.from({ length: 7 }, (_, i) => currentYear + 1 - i)

export function Header() {
  const pathname = usePathname()
  const { year, setYear } = useYear()
  const [yearOptions, setYearOptions] = useState(defaultYearOptions)

  useEffect(() => {
    getEarliestTransactionYear().then((earliest) => {
      if (earliest !== null && earliest < currentYear - 5) {
        const start = currentYear + 1
        setYearOptions(Array.from({ length: start - earliest + 1 }, (_, i) => start - i))
      }
    })
  }, [])

  // Match the most specific route first
  const title =
    Object.entries(pageTitles).find(([path]) => {
      if (path === "/") return pathname === "/"
      return pathname.startsWith(path)
    })?.[1] ?? "PersonalLedgr"

  return (
    <header className="flex h-14 items-center border-b px-6 md:px-8">
      {/* Spacer for mobile hamburger */}
      <div className="w-10 md:hidden" />
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <CalendarDays className="text-muted-foreground h-4 w-4" />
        <Select
          value={String(year)}
          onValueChange={(v) => setYear(Number(v))}
        >
          <SelectTrigger className="w-[5.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  )
}
