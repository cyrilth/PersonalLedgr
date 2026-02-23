"use server"

/**
 * Server action for creating transfer transactions between accounts.
 *
 * A transfer creates two linked transactions atomically:
 * - Outgoing (negative amount) on the source account
 * - Incoming (positive amount) on the destination account
 *
 * Both are typed TRANSFER and linked via linkedTransactionId.
 * Account balances are updated within the same database transaction.
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

function toNumber(d: unknown): number {
  return Number(d)
}

// ── Server Actions ───────────────────────────────────────────────────

export async function createTransfer(data: {
  fromAccountId: string
  toAccountId: string
  amount: number
  date: Date | string
  description: string
}) {
  const userId = await requireUserId()

  if (data.fromAccountId === data.toAccountId) {
    throw new Error("Source and destination accounts must be different")
  }

  if (data.amount <= 0) {
    throw new Error("Transfer amount must be greater than zero")
  }

  // Verify both accounts exist and belong to user
  const [fromAccount, toAccount] = await Promise.all([
    prisma.account.findFirst({ where: { id: data.fromAccountId, userId } }),
    prisma.account.findFirst({ where: { id: data.toAccountId, userId } }),
  ])

  if (!fromAccount) throw new Error("Source account not found")
  if (!toAccount) throw new Error("Destination account not found")

  const result = await prisma.$transaction(async (tx) => {
    // Create outgoing transaction (negative amount on source)
    const outgoing = await tx.transaction.create({
      data: {
        date: new Date(data.date),
        description: data.description,
        amount: -data.amount,
        type: "TRANSFER",
        source: "MANUAL",
        userId,
        accountId: data.fromAccountId,
      },
    })

    // Create incoming transaction (positive amount on destination)
    const incoming = await tx.transaction.create({
      data: {
        date: new Date(data.date),
        description: data.description,
        amount: data.amount,
        type: "TRANSFER",
        source: "MANUAL",
        userId,
        accountId: data.toAccountId,
      },
    })

    // Link outgoing → incoming via self-referential FK
    await tx.transaction.update({
      where: { id: outgoing.id },
      data: { linkedTransactionId: incoming.id },
    })

    // Update account balances
    await tx.account.update({
      where: { id: data.fromAccountId },
      data: { balance: { decrement: data.amount } },
    })

    await tx.account.update({
      where: { id: data.toAccountId },
      data: { balance: { increment: data.amount } },
    })

    return { outgoing, incoming }
  })

  return {
    outgoingId: result.outgoing.id,
    incomingId: result.incoming.id,
    outgoingAmount: toNumber(result.outgoing.amount),
    incomingAmount: toNumber(result.incoming.amount),
  }
}
