/**
 * Daily BNPL Auto-Payment Job
 *
 * Runs daily at 7 AM. For each active BNPL loan where `nextPaymentDate <= today`
 * and a `paymentAccountId` is configured, this job auto-generates the installment
 * payment as a transfer from the source account.
 *
 * For 0% interest BNPL: entire payment is a TRANSFER → LOAN_PRINCIPAL pair.
 * For BNPL with interest: uses standard interest split logic.
 *
 * After each payment:
 * - Increments completedInstallments
 * - Advances nextPaymentDate by one frequency period
 * - If completedInstallments >= totalInstallments: marks account isActive = false
 *
 * Error isolation: per-loan errors are caught and logged without aborting others.
 *
 * @module jobs/bnpl-payments
 */

import Decimal from "decimal.js"
import { prisma } from "../db.js"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toMidnight(date: Date): Date {
  date.setHours(0, 0, 0, 0)
  return date
}

function today(): Date {
  return toMidnight(new Date())
}

function toDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function advanceByFrequency(from: Date, frequency: string): Date {
  const next = new Date(from)
  if (frequency === "WEEKLY") next.setDate(next.getDate() + 7)
  else if (frequency === "BIWEEKLY") next.setDate(next.getDate() + 14)
  else next.setMonth(next.getMonth() + 1) // MONTHLY
  return toMidnight(next)
}

export async function runBnplPayments(): Promise<void> {
  const todayDate = today()
  console.log(`[bnpl-payments] Job started for ${toDateLabel(todayDate)}`)

  // Find BNPL loans due for auto-payment
  const dueBnplLoans = await prisma.loan.findMany({
    where: {
      loanType: "BNPL",
      nextPaymentDate: { lte: todayDate },
      paymentAccountId: { not: null },
      account: { isActive: true },
    },
    include: {
      account: {
        include: { user: { select: { id: true } } },
      },
    },
  })

  if (dueBnplLoans.length === 0) {
    console.log("[bnpl-payments] No BNPL payments due today. Nothing to do.")
    return
  }

  console.log(`[bnpl-payments] Found ${dueBnplLoans.length} BNPL loan(s) due`)

  let processed = 0
  let failed = 0

  for (const loan of dueBnplLoans) {
    try {
      const userId = loan.account.userId
      const totalInstallments = loan.totalInstallments ?? 0
      const installmentAmount = totalInstallments > 0
        ? round2(Number(loan.originalBalance) / totalInstallments)
        : Number(loan.monthlyPayment)
      const annualRate = Number(loan.interestRate)
      const paymentDate = new Date(loan.nextPaymentDate!)
      const description = loan.merchantName
        ? `BNPL Payment - ${loan.merchantName}`
        : "BNPL Payment"

      await prisma.$transaction(async (tx) => {
        if (annualRate === 0) {
          // 0% interest — pure transfer
          const outgoing = await tx.transaction.create({
            data: {
              date: paymentDate,
              description,
              amount: -installmentAmount,
              type: "TRANSFER",
              source: "SYSTEM",
              userId,
              accountId: loan.paymentAccountId!,
            },
          })

          const principal = await tx.transaction.create({
            data: {
              date: paymentDate,
              description,
              amount: installmentAmount,
              type: "LOAN_PRINCIPAL",
              source: "SYSTEM",
              category: "Loan Payment",
              userId,
              accountId: loan.accountId,
            },
          })

          await tx.transaction.update({
            where: { id: outgoing.id },
            data: { linkedTransactionId: principal.id },
          })

          await tx.account.update({
            where: { id: loan.paymentAccountId! },
            data: { balance: { decrement: installmentAmount } },
          })
          await tx.account.update({
            where: { id: loan.accountId },
            data: { balance: { increment: installmentAmount } },
          })
        } else {
          // BNPL with interest — split principal/interest
          const loanBalance = Math.abs(Number(loan.account.balance))
          const monthlyInterest = round2(loanBalance * annualRate / 12)
          const interestAmount = Math.min(monthlyInterest, installmentAmount)
          const principalAmount = round2(installmentAmount - interestAmount)

          const outgoing = await tx.transaction.create({
            data: {
              date: paymentDate,
              description,
              amount: -installmentAmount,
              type: "TRANSFER",
              source: "SYSTEM",
              userId,
              accountId: loan.paymentAccountId!,
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
              accountId: loan.accountId,
            },
          })

          await tx.transaction.create({
            data: {
              date: paymentDate,
              description,
              amount: -interestAmount,
              type: "LOAN_INTEREST",
              source: "SYSTEM",
              category: "Loan Payment",
              userId,
              accountId: loan.accountId,
            },
          })

          await tx.transaction.update({
            where: { id: outgoing.id },
            data: { linkedTransactionId: principal.id },
          })

          await tx.account.update({
            where: { id: loan.paymentAccountId! },
            data: { balance: { decrement: installmentAmount } },
          })
          await tx.account.update({
            where: { id: loan.accountId },
            data: { balance: { increment: principalAmount } },
          })

          await tx.interestLog.create({
            data: {
              date: paymentDate,
              amount: interestAmount,
              type: "CHARGED",
              userId,
              accountId: loan.accountId,
            },
          })
        }

        // Advance BNPL tracking
        const newCompleted = loan.completedInstallments + 1
        const nextPaymentDate = loan.installmentFrequency
          ? advanceByFrequency(paymentDate, loan.installmentFrequency)
          : null

        await tx.loan.update({
          where: { id: loan.id },
          data: {
            completedInstallments: newCompleted,
            nextPaymentDate,
          },
        })

        // Auto-deactivate when fully paid
        if (newCompleted >= totalInstallments && totalInstallments > 0) {
          await tx.account.update({
            where: { id: loan.accountId },
            data: { isActive: false },
          })
          console.log(
            `[bnpl-payments] COMPLETED loan=${loan.id} ("${loan.merchantName ?? loan.account.name}") — all ${totalInstallments} installments paid`,
          )
        }
      })

      console.log(
        `[bnpl-payments] OK    loan=${loan.id} amount=$${installmentAmount.toFixed(2)} ` +
          `installment=${loan.completedInstallments + 1}/${totalInstallments}`,
      )
      processed++
    } catch (err) {
      console.error(`[bnpl-payments] ERROR loan=${loan.id}:`, err)
      failed++
    }
  }

  console.log(
    `[bnpl-payments] Job complete. processed=${processed} failed=${failed}`,
  )
}
