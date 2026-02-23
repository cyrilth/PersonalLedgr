"use server"

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants"
import type { AccountType } from "@/lib/constants"

// ── Helpers ──────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function toNumber(d: unknown): number {
  return Number(d)
}

// ── Types ────────────────────────────────────────────────────────────

interface AccountGroup {
  type: string
  label: string
  accounts: AccountSummary[]
  total: number
}

interface AccountSummary {
  id: string
  name: string
  type: string
  balance: number
  creditLimit: number | null
  owner: string | null
  isActive: boolean
}

// ── Server Actions ───────────────────────────────────────────────────

const TYPE_ORDER: AccountType[] = ["CHECKING", "SAVINGS", "CREDIT_CARD", "LOAN", "MORTGAGE"]

export async function getAccounts(): Promise<AccountGroup[]> {
  const userId = await requireUserId()

  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      balance: true,
      creditLimit: true,
      owner: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  })

  const grouped: Record<string, AccountSummary[]> = {}
  for (const a of accounts) {
    const type = a.type as string
    if (!grouped[type]) grouped[type] = []
    grouped[type].push({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: toNumber(a.balance),
      creditLimit: a.creditLimit ? toNumber(a.creditLimit) : null,
      owner: a.owner,
      isActive: a.isActive,
    })
  }

  return TYPE_ORDER.filter((t) => grouped[t])
    .map((t) => ({
      type: t,
      label: ACCOUNT_TYPE_LABELS[t],
      accounts: grouped[t],
      total: grouped[t].reduce((sum, a) => sum + a.balance, 0),
    }))
}

export async function getAccount(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({
    where: { id, userId },
    include: {
      creditCardDetails: true,
      loan: true,
      aprRates: { where: { isActive: true }, orderBy: { effectiveDate: "desc" } },
      transactions: {
        orderBy: { date: "desc" },
        take: 20,
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          type: true,
          category: true,
          account: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!account) throw new Error("Account not found")

  const balanceHistory = await getBalanceHistory(id)

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balance: toNumber(account.balance),
    creditLimit: account.creditLimit ? toNumber(account.creditLimit) : null,
    owner: account.owner,
    isActive: account.isActive,
    creditCardDetails: account.creditCardDetails
      ? {
          id: account.creditCardDetails.id,
          statementCloseDay: account.creditCardDetails.statementCloseDay,
          paymentDueDay: account.creditCardDetails.paymentDueDay,
          gracePeriodDays: account.creditCardDetails.gracePeriodDays,
          lastStatementBalance: toNumber(account.creditCardDetails.lastStatementBalance),
          lastStatementPaidInFull: account.creditCardDetails.lastStatementPaidInFull,
          minimumPaymentPct: toNumber(account.creditCardDetails.minimumPaymentPct),
          minimumPaymentFloor: toNumber(account.creditCardDetails.minimumPaymentFloor),
        }
      : null,
    loan: account.loan
      ? {
          id: account.loan.id,
          loanType: account.loan.loanType,
          originalBalance: toNumber(account.loan.originalBalance),
          interestRate: toNumber(account.loan.interestRate),
          termMonths: account.loan.termMonths,
          startDate: account.loan.startDate,
          monthlyPayment: toNumber(account.loan.monthlyPayment),
          extraPaymentAmount: toNumber(account.loan.extraPaymentAmount),
        }
      : null,
    aprRates: account.aprRates.map((r) => ({
      id: r.id,
      rateType: r.rateType,
      apr: toNumber(r.apr),
      effectiveDate: r.effectiveDate,
      expirationDate: r.expirationDate,
      description: r.description,
      isActive: r.isActive,
    })),
    transactions: account.transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: toNumber(t.amount),
      type: t.type,
      category: t.category,
      account: t.account,
    })),
    balanceHistory,
  }
}

export async function createAccount(data: {
  name: string
  type: AccountType
  balance: number
  owner?: string
  creditLimit?: number
  creditCard?: {
    statementCloseDay: number
    paymentDueDay: number
    gracePeriodDays: number
  }
  loan?: {
    loanType: string
    originalBalance: number
    interestRate: number
    termMonths: number
    startDate: string
    monthlyPayment: number
    extraPaymentAmount: number
  }
}) {
  const userId = await requireUserId()

  const account = await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      balance: data.balance,
      creditLimit: data.creditLimit,
      owner: data.owner || null,
      userId,
      creditCardDetails:
        data.type === "CREDIT_CARD" && data.creditCard
          ? {
              create: {
                statementCloseDay: data.creditCard.statementCloseDay,
                paymentDueDay: data.creditCard.paymentDueDay,
                gracePeriodDays: data.creditCard.gracePeriodDays,
              },
            }
          : undefined,
      loan:
        (data.type === "LOAN" || data.type === "MORTGAGE") && data.loan
          ? {
              create: {
                loanType: data.loan.loanType as "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL",
                originalBalance: data.loan.originalBalance,
                interestRate: data.loan.interestRate,
                termMonths: data.loan.termMonths,
                startDate: new Date(data.loan.startDate),
                monthlyPayment: data.loan.monthlyPayment,
                extraPaymentAmount: data.loan.extraPaymentAmount,
              },
            }
          : undefined,
    },
  })

  return { id: account.id }
}

export async function updateAccount(
  id: string,
  data: {
    name: string
    balance: number
    owner?: string
    creditLimit?: number
    creditCard?: {
      statementCloseDay: number
      paymentDueDay: number
      gracePeriodDays: number
    }
    loan?: {
      loanType: string
      originalBalance: number
      interestRate: number
      termMonths: number
      startDate: string
      monthlyPayment: number
      extraPaymentAmount: number
    }
  }
) {
  const userId = await requireUserId()

  // Verify ownership
  const existing = await prisma.account.findFirst({ where: { id, userId } })
  if (!existing) throw new Error("Account not found")

  await prisma.account.update({
    where: { id },
    data: {
      name: data.name,
      balance: data.balance,
      creditLimit: data.creditLimit,
      owner: data.owner || null,
    },
  })

  // Upsert credit card details
  if (existing.type === "CREDIT_CARD" && data.creditCard) {
    await prisma.creditCardDetails.upsert({
      where: { accountId: id },
      create: {
        accountId: id,
        statementCloseDay: data.creditCard.statementCloseDay,
        paymentDueDay: data.creditCard.paymentDueDay,
        gracePeriodDays: data.creditCard.gracePeriodDays,
      },
      update: {
        statementCloseDay: data.creditCard.statementCloseDay,
        paymentDueDay: data.creditCard.paymentDueDay,
        gracePeriodDays: data.creditCard.gracePeriodDays,
      },
    })
  }

  // Upsert loan details
  if ((existing.type === "LOAN" || existing.type === "MORTGAGE") && data.loan) {
    await prisma.loan.upsert({
      where: { accountId: id },
      create: {
        accountId: id,
        loanType: data.loan.loanType as "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL",
        originalBalance: data.loan.originalBalance,
        interestRate: data.loan.interestRate,
        termMonths: data.loan.termMonths,
        startDate: new Date(data.loan.startDate),
        monthlyPayment: data.loan.monthlyPayment,
        extraPaymentAmount: data.loan.extraPaymentAmount,
      },
      update: {
        loanType: data.loan.loanType as "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL",
        originalBalance: data.loan.originalBalance,
        interestRate: data.loan.interestRate,
        termMonths: data.loan.termMonths,
        startDate: new Date(data.loan.startDate),
        monthlyPayment: data.loan.monthlyPayment,
        extraPaymentAmount: data.loan.extraPaymentAmount,
      },
    })
  }

  return { success: true }
}

export async function deleteAccount(id: string) {
  const userId = await requireUserId()

  const existing = await prisma.account.findFirst({ where: { id, userId } })
  if (!existing) throw new Error("Account not found")

  await prisma.account.update({
    where: { id },
    data: { isActive: false },
  })

  return { success: true }
}

export async function recalculateBalance(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({ where: { id, userId } })
  if (!account) throw new Error("Account not found")

  const result = await prisma.transaction.aggregate({
    where: { accountId: id },
    _sum: { amount: true },
  })

  const stored = toNumber(account.balance)
  const calculated = toNumber(result._sum.amount ?? 0)
  const drift = Math.round((calculated - stored) * 100) / 100

  return { stored, calculated, drift }
}

export async function confirmRecalculate(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({ where: { id, userId } })
  if (!account) throw new Error("Account not found")

  const result = await prisma.transaction.aggregate({
    where: { accountId: id },
    _sum: { amount: true },
  })

  const calculated = toNumber(result._sum.amount ?? 0)

  await prisma.account.update({
    where: { id },
    data: { balance: calculated },
  })

  return { balance: calculated }
}

export async function getBalanceHistory(
  accountId: string,
  months: number = 12
): Promise<{ date: string; balance: number }[]> {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
  if (!account) throw new Error("Account not found")

  const currentBalance = toNumber(account.balance)
  const now = new Date()

  // Get all transactions for the last N months
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: startDate },
    },
    select: { date: true, amount: true },
    orderBy: { date: "asc" },
  })

  // Group transactions by month
  const monthlyTotals: Record<string, number> = {}
  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthlyTotals[key] = (monthlyTotals[key] || 0) + toNumber(t.amount)
  }

  // Build month keys from start to current
  const monthKeys: string[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  // Walk backwards from current balance
  const history: { date: string; balance: number }[] = []
  let runningBalance = currentBalance

  // Start from the most recent month and work backwards
  for (let i = monthKeys.length - 1; i >= 0; i--) {
    history.unshift({ date: monthKeys[i], balance: Math.round(runningBalance * 100) / 100 })
    // Subtract this month's transactions to get prior month's end balance
    const monthSum = monthlyTotals[monthKeys[i]] || 0
    runningBalance -= monthSum
  }

  return history
}
