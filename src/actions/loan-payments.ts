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
import { toDisplayDate } from "@/lib/utils"

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

/** Whole calendar months from `start` to `date` (negative if `date` precedes it). */
function monthsElapsed(start: Date, date: Date): number {
  return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth())
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

  // A loan/mortgage can't fund a payment — that would corrupt both balances.
  // The UI filters these out; this is defense-in-depth for the write path.
  if (fromAccount.type === "LOAN" || fromAccount.type === "MORTGAGE") {
    throw new Error("Cannot pay a loan from another loan or mortgage account")
  }

  const isBNPL = loanAccount.loan.loanType === "BNPL"
  const isPayday = loanAccount.loan.loanType === "PAYDAY"
  const annualRate = toNumber(loanAccount.loan.interestRate)
  // A bare YYYY-MM-DD date input is parsed as LOCAL midnight (not UTC) so the
  // payment lands in the month the user picked when grouped by local getMonth().
  const paymentDate = toDisplayDate(data.date)
  const description = data.description || (isPayday ? "Payday Loan Payment" : isBNPL ? "BNPL Payment" : "Loan Payment")

  // Deferment guard: while a loan is in its no-payment deferment phase it is
  // "not due", and the monthly accrual cron capitalizes that phase's interest
  // assuming nothing is paid into it. A payment dated inside [startDate, startDate
  // + defermentMonths) would double-count that interest (capitalized by the cron
  // AND paid here) and skew the cron's catch-up base, so reject it. Calendar-month
  // indexed to match the payment grid, remainingLoanPhases, and the cron itself.
  const defermentMonths = loanAccount.loan.defermentMonths ?? 0
  if (defermentMonths > 0) {
    const loanStart = new Date(loanAccount.loan.startDate)
    const monthIdx = monthsElapsed(loanStart, paymentDate)
    if (monthIdx >= 0 && monthIdx < defermentMonths) {
      const dueFrom = new Date(loanStart.getFullYear(), loanStart.getMonth() + defermentMonths, 1)
      throw new Error(
        `This loan is in its deferment period — no payment is due until ${dueFrom.toLocaleDateString(
          "en-US",
          { month: "long", year: "numeric" },
        )}. Payments dated during deferment aren't supported.`,
      )
    }
  }

  if (isPayday) {
    // Payday loan — flat fee, single balloon payment
    const feePerHundred = loanAccount.loan.feePerHundred ? toNumber(loanAccount.loan.feePerHundred) : 0
    const originalPrincipal = toNumber(loanAccount.loan.originalBalance)
    const fee = round2(originalPrincipal * (feePerHundred / 100))
    // Split payment: fee goes to interest, remainder to principal
    const interestAmount = Math.min(fee, data.amount)
    const principalAmount = round2(data.amount - interestAmount)

    const result = await prisma.$transaction(async (tx) => {
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

      await tx.transaction.update({
        where: { id: outgoing.id },
        data: { linkedTransactionId: principal.id },
      })

      // Update balances
      await tx.account.update({
        where: { id: data.fromAccountId },
        data: { balance: { decrement: data.amount } },
      })
      await tx.account.update({
        where: { id: data.loanAccountId },
        data: { balance: { increment: principalAmount } },
      })

      // Interest log
      await tx.interestLog.create({
        data: {
          date: paymentDate,
          amount: interestAmount,
          type: "CHARGED",
          userId,
          accountId: data.loanAccountId,
        },
      })

      // Check if loan is fully paid (balance reaches 0 or above)
      const updatedAccount = await tx.account.findUnique({
        where: { id: data.loanAccountId },
        select: { balance: true },
      })
      if (updatedAccount && toNumber(updatedAccount.balance) >= 0) {
        await tx.account.update({
          where: { id: data.loanAccountId },
          data: { isActive: false },
        })
      }

      return { outgoing, principal, interest }
    })

    return {
      outgoingId: result.outgoing.id,
      principalId: result.principal.id,
      interestId: result.interest.id,
      principalAmount,
      interestAmount,
      totalAmount: -data.amount,
    }
  }

  if (isBNPL && annualRate === 0) {
    // BNPL with 0% interest — entire payment is a transfer (no interest split)
    const result = await prisma.$transaction(async (tx) => {
      // Outgoing from source account
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

      // Incoming on BNPL account (principal only, moves balance toward zero)
      const principal = await tx.transaction.create({
        data: {
          date: paymentDate,
          description,
          amount: data.amount,
          type: "LOAN_PRINCIPAL",
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

      // Update balances
      await tx.account.update({
        where: { id: data.fromAccountId },
        data: { balance: { decrement: data.amount } },
      })
      await tx.account.update({
        where: { id: data.loanAccountId },
        data: { balance: { increment: data.amount } },
      })

      // Advance BNPL tracking
      const newCompleted = loanAccount.loan!.completedInstallments + 1
      const totalInstallments = loanAccount.loan!.totalInstallments ?? 0
      let newNextPaymentDate = loanAccount.loan!.nextPaymentDate

      if (newNextPaymentDate && loanAccount.loan!.installmentFrequency) {
        const next = new Date(newNextPaymentDate)
        const freq = loanAccount.loan!.installmentFrequency
        if (freq === "WEEKLY") next.setDate(next.getDate() + 7)
        else if (freq === "BIWEEKLY") next.setDate(next.getDate() + 14)
        else next.setMonth(next.getMonth() + 1)
        newNextPaymentDate = next
      }

      await tx.loan.update({
        where: { id: loanAccount.loan!.id },
        data: {
          completedInstallments: newCompleted,
          nextPaymentDate: newNextPaymentDate,
        },
      })

      // Auto-deactivate when fully paid
      if (newCompleted >= totalInstallments && totalInstallments > 0) {
        await tx.account.update({
          where: { id: data.loanAccountId },
          data: { isActive: false },
        })
      }

      return { outgoing, principal }
    })

    return {
      outgoingId: result.outgoing.id,
      principalId: result.principal.id,
      interestId: null,
      principalAmount: data.amount,
      interestAmount: 0,
      totalAmount: -data.amount,
    }
  }

  // Standard loan payment (or BNPL with interest) — existing logic.
  // interestRate is stored as a percentage (e.g. 6 = 6%), so divide by 100.
  const loanBalance = Math.abs(toNumber(loanAccount.balance))

  // Interest accrues on the balance owed AT the payment date. For a payment
  // dated today this equals the current balance; for a back-dated catch-up
  // payment we add back the principal applied AFTER that date (interest entries
  // never move the balance), so the split reflects what was actually owed then.
  const laterPrincipal = await prisma.transaction.aggregate({
    where: {
      accountId: data.loanAccountId,
      type: "LOAN_PRINCIPAL",
      date: { gt: paymentDate },
    },
    _sum: { amount: true },
  })
  const balanceAtDate = round2(loanBalance + toNumber(laterPrincipal._sum.amount ?? 0))
  const monthlyInterest = round2((balanceAtDate * (annualRate / 100)) / 12)

  let interestAmount: number
  let principalAmount: number

  if (data.amount <= monthlyInterest) {
    interestAmount = round2(data.amount)
    principalAmount = 0
  } else {
    interestAmount = monthlyInterest
    principalAmount = round2(data.amount - interestAmount)
  }

  // Cap principal at the outstanding balance so an overpayment cannot push the
  // loan account into a positive (asset) balance. The effective payment is then
  // interest + capped principal; any excess is not withdrawn from the source.
  if (principalAmount > loanBalance) {
    principalAmount = loanBalance
  }
  const effectivePayment = round2(interestAmount + principalAmount)

  const result = await prisma.$transaction(async (tx) => {
    // Transaction A: TRANSFER on source account (outgoing)
    const outgoing = await tx.transaction.create({
      data: {
        date: paymentDate,
        description,
        amount: -effectivePayment,
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
      data: { balance: { decrement: effectivePayment } },
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

    // For standard loans (non-BNPL), deactivate when the balance reaches zero.
    // After incrementing by principal the new balance is (-loanBalance + principal);
    // because principal is capped at loanBalance it can never go positive.
    if (!isBNPL && round2(-loanBalance + principalAmount) >= 0) {
      await tx.account.update({
        where: { id: data.loanAccountId },
        data: { isActive: false },
      })
    }

    // If BNPL with interest, also advance installment tracking
    if (isBNPL) {
      const newCompleted = loanAccount.loan!.completedInstallments + 1
      const totalInstallments = loanAccount.loan!.totalInstallments ?? 0
      let newNextPaymentDate = loanAccount.loan!.nextPaymentDate

      if (newNextPaymentDate && loanAccount.loan!.installmentFrequency) {
        const next = new Date(newNextPaymentDate)
        const freq = loanAccount.loan!.installmentFrequency
        if (freq === "WEEKLY") next.setDate(next.getDate() + 7)
        else if (freq === "BIWEEKLY") next.setDate(next.getDate() + 14)
        else next.setMonth(next.getMonth() + 1)
        newNextPaymentDate = next
      }

      await tx.loan.update({
        where: { id: loanAccount.loan!.id },
        data: {
          completedInstallments: newCompleted,
          nextPaymentDate: newNextPaymentDate,
        },
      })

      if (newCompleted >= totalInstallments && totalInstallments > 0) {
        await tx.account.update({
          where: { id: data.loanAccountId },
          data: { isActive: false },
        })
      }
    }

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
