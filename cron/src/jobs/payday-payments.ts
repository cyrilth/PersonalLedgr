/**
 * Daily Payday Loan Auto-Payment Job
 *
 * Runs daily at 7 AM. For each active payday loan where `dueDate <= today`
 * (or `nextPaymentDate <= today`) and a `paymentAccountId` is configured,
 * this job auto-generates the full repayment as a transfer from the source account.
 *
 * Payday loans are single balloon payments: principal + flat fee.
 * The fee is calculated as `originalBalance * (feePerHundred / 100)`.
 *
 * After payment:
 * - Creates TRANSFER (source) + LOAN_PRINCIPAL + LOAN_INTEREST transactions
 * - Updates both account balances
 * - Creates InterestLog entry for the fee
 * - Marks account isActive = false (fully paid)
 *
 * Error isolation: per-loan errors are caught and logged without aborting others.
 *
 * @module jobs/payday-payments
 */

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

export async function runPaydayPayments(): Promise<void> {
  const todayDate = today()
  console.log(`[payday-payments] Job started for ${toDateLabel(todayDate)}`)

  // Find payday loans due for auto-payment
  const duePaydayLoans = await prisma.loan.findMany({
    where: {
      loanType: "PAYDAY",
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

  if (duePaydayLoans.length === 0) {
    console.log("[payday-payments] No payday payments due today. Nothing to do.")
    return
  }

  console.log(`[payday-payments] Found ${duePaydayLoans.length} payday loan(s) due`)

  let processed = 0
  let failed = 0

  for (const loan of duePaydayLoans) {
    try {
      const userId = loan.account.userId
      const originalBalance = Number(loan.originalBalance)
      const feePerHundred = loan.feePerHundred ? Number(loan.feePerHundred) : 0
      const fee = round2(originalBalance * (feePerHundred / 100))
      const remainingBalance = Math.abs(Number(loan.account.balance))
      // Principal portion = remaining balance - fee (or just the original balance)
      const principalAmount = round2(remainingBalance - fee)
      const totalPayment = remainingBalance
      const paymentDate = loan.dueDate ? new Date(loan.dueDate) : todayDate
      const description = loan.lenderName
        ? `Payday Loan Payment - ${loan.lenderName}`
        : "Payday Loan Payment"

      await prisma.$transaction(async (tx) => {
        // TRANSFER from source account
        const outgoing = await tx.transaction.create({
          data: {
            date: paymentDate,
            description,
            amount: -totalPayment,
            type: "TRANSFER",
            source: "SYSTEM",
            userId,
            accountId: loan.paymentAccountId!,
          },
        })

        // LOAN_PRINCIPAL on loan account
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

        // LOAN_INTEREST on loan account (the fee)
        await tx.transaction.create({
          data: {
            date: paymentDate,
            description,
            amount: -fee,
            type: "LOAN_INTEREST",
            source: "SYSTEM",
            category: "Loan Payment",
            userId,
            accountId: loan.accountId,
          },
        })

        // Link outgoing → principal
        await tx.transaction.update({
          where: { id: outgoing.id },
          data: { linkedTransactionId: principal.id },
        })

        // Update balances
        await tx.account.update({
          where: { id: loan.paymentAccountId! },
          data: { balance: { decrement: totalPayment } },
        })
        await tx.account.update({
          where: { id: loan.accountId },
          data: { balance: { increment: principalAmount } },
        })

        // Interest log for the fee
        await tx.interestLog.create({
          data: {
            date: paymentDate,
            amount: fee,
            type: "CHARGED",
            userId,
            accountId: loan.accountId,
          },
        })

        // Payday loans are single payment — deactivate on payoff
        await tx.account.update({
          where: { id: loan.accountId },
          data: { isActive: false },
        })
      })

      console.log(
        `[payday-payments] OK    loan=${loan.id} principal=$${principalAmount.toFixed(2)} ` +
          `fee=$${fee.toFixed(2)} total=$${totalPayment.toFixed(2)}`,
      )
      processed++
    } catch (err) {
      console.error(`[payday-payments] ERROR loan=${loan.id}:`, err)
      failed++
    }
  }

  console.log(
    `[payday-payments] Job complete. processed=${processed} failed=${failed}`,
  )
}
