"use client"

import { usePathname } from "next/navigation"

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/accounts": "Accounts",
  "/loans": "Loans",
  "/recurring": "Recurring Bills",
  "/budgets": "Budgets",
  "/import": "Import",
  "/settings": "Settings",
}

export function Header() {
  const pathname = usePathname()

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
    </header>
  )
}
