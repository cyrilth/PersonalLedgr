"use server"

/**
 * Server action for recording loan payments.
 *
 * A loan payment from a checking/savings account creates three linked transactions:
 * - Transaction A: TRANSFER on the source account (negative, full payment)
 * - Transaction B: LOAN_PRINCIPAL on the loan account (positive, principal portion)
 * - Transaction C: LOAN_INTEREST on the loan account (negative, interest portion)
 *
 * A→B linked via linkedTransactionId. Interest split uses simple monthly amortization.
 * Both account balances and an InterestLog entry are updated atomically.
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

// ── Helpers ──────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toNumber(d: unknown): number {
  return Number(d)
}

// ── Server Actions ───────────────────────────────────────────────────

export async function recordLoanPayment(data: {
  loanAccountId: string
  fromAccountId: string
  amount: number
  date: Date | string
  description?: string
}) {
  const userId = await requireUserId()

  if (data.amount <= 0) {
    throw new Error("Payment amount must be greater than zero")
  }

  if (data.fromAccountId === data.loanAccountId) {
    throw new Error("Source and loan accounts must be different")
  }

  // Verify both accounts exist and belong to user; loan account must have a Loan record
  const [fromAccount, loanAccount] = await Promise.all([
    prisma.account.findFirst({ where: { id: data.fromAccountId, userId } }),
    prisma.account.findFirst({
      where: { id: data.loanAccountId, userId },
      include: { loan: true },
    }),
  ])

  if (!fromAccount) throw new Error("Source account not found")
  if (!loanAccount) throw new Error("Loan account not found")
  if (!loanAccount.loan) throw new Error("Account does not have a loan record")

  // Calculate interest/principal split
  const loanBalance = Math.abs(toNumber(loanAccount.balance))
  const annualRate = toNumber(loanAccount.loan.interestRate)
  const monthlyInterest = round2(loanBalance * annualRate / 12)

  let interestAmount: number
  let principalAmount: number

  if (data.amount <= monthlyInterest) {
    // Payment doesn't cover full interest — all goes to interest
    interestAmount = round2(data.amount)
    principalAmount = 0
  } else {
    interestAmount = monthlyInterest
    principalAmount = round2(data.amount - interestAmount)
  }

  const paymentDate = new Date(data.date)
  const description = data.description || "Loan Payment"

  const result = await prisma.$transaction(async (tx) => {
    // Transaction A: TRANSFER on source account (outgoing)
    const outgoing = await tx.transaction.create({
      data: {
        date: paymentDate,
        description,
        amount: -data.amount,
        type: "TRANSFER",
        source: "MANUAL",
        userId,
        accountId: data.fromAccountId,
      },
    })

    // Transaction B: LOAN_PRINCIPAL on loan account (positive, reduces debt)
    const principal = await tx.transaction.create({
      data: {
        date: paymentDate,
        description,
        amount: principalAmount,
        type: "LOAN_PRINCIPAL",
        source: "SYSTEM",
        category: "Loan Payment",
        userId,
        accountId: data.loanAccountId,
      },
    })

    // Transaction C: LOAN_INTEREST on loan account (negative, interest charge)
    const interest = await tx.transaction.create({
      data: {
        date: paymentDate,
        description,
        amount: -interestAmount,
        type: "LOAN_INTEREST",
        source: "SYSTEM",
        category: "Loan Payment",
        userId,
        accountId: data.loanAccountId,
      },
    })

    // Link outgoing → principal
    await tx.transaction.update({
      where: { id: outgoing.id },
      data: { linkedTransactionId: principal.id },
    })

    // Update source account balance
    await tx.account.update({
      where: { id: data.fromAccountId },
      data: { balance: { decrement: data.amount } },
    })

    // Update loan account balance (increment by principal moves toward zero)
    await tx.account.update({
      where: { id: data.loanAccountId },
      data: { balance: { increment: principalAmount } },
    })

    // Create InterestLog entry
    await tx.interestLog.create({
      data: {
        date: paymentDate,
        amount: interestAmount,
        type: "CHARGED",
        userId,
        accountId: data.loanAccountId,
      },
    })

    return { outgoing, principal, interest }
  })

  return {
    outgoingId: result.outgoing.id,
    principalId: result.principal.id,
    interestId: result.interest.id,
    principalAmount,
    interestAmount,
    totalAmount: toNumber(result.outgoing.amount),
  }
}
