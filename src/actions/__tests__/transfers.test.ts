import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Map()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("@/db", () => {
  const txClient = {
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
  }

  return {
    prisma: {
      account: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import { createTransfer } from "../transfers"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockPrismaTransaction = vi.mocked(prisma.$transaction)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txClient = (prisma as any)._txClient as {
  transaction: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  account: { update: ReturnType<typeof vi.fn> }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

const validInput = {
  fromAccountId: "acc-1",
  toAccountId: "acc-2",
  amount: 500,
  date: "2026-01-15",
  description: "Transfer: Checking → Savings",
}

const mockOutgoing = {
  id: "txn-out",
  date: new Date("2026-01-15"),
  description: "Transfer: Checking → Savings",
  amount: decimal(-500),
  type: "TRANSFER",
  source: "MANUAL",
  notes: null,
  accountId: "acc-1",
  userId: "user-1",
  linkedTransactionId: null,
}

const mockIncoming = {
  id: "txn-in",
  date: new Date("2026-01-15"),
  description: "Transfer: Checking → Savings",
  amount: decimal(500),
  type: "TRANSFER",
  source: "MANUAL",
  notes: null,
  accountId: "acc-2",
  userId: "user-1",
  linkedTransactionId: null,
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)

  // Default: both accounts exist and belong to user
  mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
    if (args.where.id === "acc-1") return Promise.resolve({ id: "acc-1", userId: "user-1" })
    if (args.where.id === "acc-2") return Promise.resolve({ id: "acc-2", userId: "user-1" })
    return Promise.resolve(null)
  }) as never)

  // Default tx client return values
  let callCount = 0
  txClient.transaction.create.mockImplementation(() => {
    callCount++
    return callCount === 1 ? mockOutgoing : mockIncoming
  })
  txClient.transaction.update.mockResolvedValue({} as never)
  txClient.account.update.mockResolvedValue({} as never)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createTransfer", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(createTransfer(validInput)).rejects.toThrow("Unauthorized")
  })

  it("throws when source account not found", async () => {
    mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "acc-1") return Promise.resolve(null)
      return Promise.resolve({ id: "acc-2", userId: "user-1" })
    }) as never)

    await expect(createTransfer(validInput)).rejects.toThrow("Source account not found")
  })

  it("throws when destination account not found", async () => {
    mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "acc-1") return Promise.resolve({ id: "acc-1", userId: "user-1" })
      return Promise.resolve(null)
    }) as never)

    await expect(createTransfer(validInput)).rejects.toThrow("Destination account not found")
  })

  it("throws when source and destination are the same account", async () => {
    await expect(
      createTransfer({ ...validInput, fromAccountId: "acc-1", toAccountId: "acc-1" })
    ).rejects.toThrow("Source and destination accounts must be different")
  })

  it("throws when amount is zero", async () => {
    await expect(createTransfer({ ...validInput, amount: 0 })).rejects.toThrow(
      "Transfer amount must be greater than zero"
    )
  })

  it("throws when amount is negative", async () => {
    await expect(createTransfer({ ...validInput, amount: -100 })).rejects.toThrow(
      "Transfer amount must be greater than zero"
    )
  })

  it("verifies both accounts belong to the user", async () => {
    await createTransfer(validInput)

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    })
    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-2", userId: "user-1" },
    })
  })

  it("creates two linked transactions inside a $transaction block", async () => {
    await createTransfer(validInput)
    expect(mockPrismaTransaction).toHaveBeenCalledOnce()
  })

  it("creates outgoing transaction with negative amount and TRANSFER type", async () => {
    await createTransfer(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -500,
        type: "TRANSFER",
        source: "MANUAL",
        accountId: "acc-1",
        userId: "user-1",
      }),
    })
  })

  it("creates incoming transaction with positive amount and TRANSFER type", async () => {
    await createTransfer(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 500,
        type: "TRANSFER",
        source: "MANUAL",
        accountId: "acc-2",
        userId: "user-1",
      }),
    })
  })

  it("both transactions are typed as TRANSFER", async () => {
    await createTransfer(validInput)

    const calls = txClient.transaction.create.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0].data.type).toBe("TRANSFER")
    expect(calls[1][0].data.type).toBe("TRANSFER")
  })

  it("links outgoing → incoming via linkedTransactionId", async () => {
    await createTransfer(validInput)

    expect(txClient.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-out" },
      data: { linkedTransactionId: "txn-in" },
    })
  })

  it("decrements source account balance by transfer amount", async () => {
    await createTransfer(validInput)

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { decrement: 500 } },
    })
  })

  it("increments destination account balance by transfer amount", async () => {
    await createTransfer(validInput)

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-2" },
      data: { balance: { increment: 500 } },
    })
  })

  it("updates both account balances atomically (inside same tx)", async () => {
    await createTransfer(validInput)

    // Both account updates should happen — 2 calls total
    expect(txClient.account.update).toHaveBeenCalledTimes(2)
  })

  it("converts date string to Date object", async () => {
    await createTransfer(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ date: new Date("2026-01-15") }),
    })
  })

  it("passes description to both transactions", async () => {
    await createTransfer(validInput)

    const calls = txClient.transaction.create.mock.calls
    expect(calls[0][0].data.description).toBe("Transfer: Checking → Savings")
    expect(calls[1][0].data.description).toBe("Transfer: Checking → Savings")
  })

  it("returns both transaction IDs and serialized amounts", async () => {
    const result = await createTransfer(validInput)

    expect(result).toEqual({
      outgoingId: "txn-out",
      incomingId: "txn-in",
      outgoingAmount: -500,
      incomingAmount: 500,
    })
  })

  it("same-account check runs before account lookup", async () => {
    // Should throw without querying DB
    await expect(
      createTransfer({ ...validInput, fromAccountId: "acc-1", toAccountId: "acc-1" })
    ).rejects.toThrow("Source and destination accounts must be different")

    expect(mockAccountFindFirst).not.toHaveBeenCalled()
  })
})
