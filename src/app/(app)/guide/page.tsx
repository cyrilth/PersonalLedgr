"use client"

import Link from "next/link"
import {
  AlertTriangle,
  Database,
  Landmark,
  ArrowLeftRight,
  CalendarClock,
  PieChart,
  LayoutDashboard,
  BarChart3,
  Settings,
  UserCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const steps = [
  {
    number: 1,
    title: "Accept the Disclaimer",
    icon: AlertTriangle,
    description:
      "On first login, a disclaimer modal appears. Read it and click \"I understand and accept\" to proceed. You can also review it anytime in Settings.",
    link: { href: "/settings", label: "Go to Settings" },
  },
  {
    number: 2,
    title: "Explore with Demo Data (Optional)",
    icon: Database,
    description:
      "Go to Settings > Seed Data > \"Load Demo Data\" to populate the app with sample accounts, transactions, and bills. Great for exploring before entering real data. You can wipe it later with \"Wipe All Data\".",
    link: { href: "/settings", label: "Go to Settings" },
  },
  {
    number: 3,
    title: "Set Up Your Accounts",
    icon: Landmark,
    description:
      "Navigate to Accounts and click \"Add Account\". Start with your checking and savings accounts — these are needed as payment sources for bills and loans. Then add credit cards, loans, or mortgages as needed. Each account type has specific fields like credit limit, interest rate, etc.",
    link: { href: "/accounts", label: "Go to Accounts" },
  },
  {
    number: 4,
    title: "Enter Your Transactions",
    icon: ArrowLeftRight,
    description:
      "Two ways to add transactions: (a) Manually via Transactions > \"Add Transaction\" — supports Expense, Income, Transfer, and Loan Payment types. (b) Import from CSV via the Import page — a 3-step wizard that auto-detects columns and catches duplicates.",
    link: { href: "/transactions", label: "Go to Transactions" },
  },
  {
    number: 5,
    title: "Set Up Recurring Bills",
    icon: CalendarClock,
    description:
      "Go to Recurring Bills and click \"Add Bill\". Assign each bill to a payment account. Supports Weekly, Biweekly, Monthly, Quarterly, and Annual frequencies. Flag variable-amount bills (like utilities) for confirmation prompts.",
    link: { href: "/recurring", label: "Go to Recurring Bills" },
  },
  {
    number: 6,
    title: "Create Budgets",
    icon: PieChart,
    description:
      "Navigate to Budgets, select the current month, and add per-category spending limits. Use \"Copy from Previous Month\" to save time in future months.",
    link: { href: "/budgets", label: "Go to Budgets" },
  },
  {
    number: 7,
    title: "Monitor Your Dashboard",
    icon: LayoutDashboard,
    description:
      "The dashboard shows Net Worth, Income vs Expense trends, Spending Breakdown, Credit Utilization, Upcoming Bills, and Recent Transactions at a glance.",
    link: { href: "/", label: "Go to Dashboard" },
  },
  {
    number: 8,
    title: "Run Reports",
    icon: BarChart3,
    description:
      "Use the Reports page to analyze spending and income across custom date ranges with category breakdowns, trend charts, and running totals.",
    link: { href: "/reports", label: "Go to Reports" },
  },
  {
    number: 9,
    title: "Customize Settings",
    icon: Settings,
    description:
      "Visit Settings to manage categories (add custom ones), configure appearance (dark/light theme), set up tithing tracking, export your data, or recalculate balances if drift occurs.",
    link: { href: "/settings", label: "Go to Settings" },
  },
  {
    number: 10,
    title: "Update Your Profile",
    icon: UserCircle,
    description:
      "Go to Settings > Account & Profile to set your display name and upload an avatar.",
    link: { href: "/profile", label: "Go to Profile" },
  },
]

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Getting Started</h2>
        <p className="text-muted-foreground">
          Follow these steps to set up PersonalLedgr and start tracking your
          finances.
        </p>
      </div>

      <div className="space-y-4">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <Card key={step.number}>
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </div>
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{step.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pl-16">
                <p className="text-sm text-muted-foreground mb-3">
                  {step.description}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={step.link.href}>{step.link.label}</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
