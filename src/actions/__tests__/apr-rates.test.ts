/**
 * Tests for APR rate CRUD server actions.
 *
 * Covers all four actions: getAprRates, createAprRate, updateAprRate, deleteAprRate.
 * Validates auth checks, account type guards (credit card only), ownership
 * verification, APR validation, partial updates, and soft-delete behavior.
 *
 * Mock pattern: Prisma methods are mocked at the module level; each test
 * configures return values via the typed mock accessors below.
 */

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
  return {
    prisma: {
      account: {
        findFirst: vi.fn(),
      },
      aprRate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  getAprRates,
  createAprRate,
  updateAprRate,
  deleteAprRate,
} from "../apr-rates"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockAprRateFindMany = vi.mocked(prisma.aprRate.findMany)
const mockAprRateFindFirst = vi.mocked(prisma.aprRate.findFirst)
const mockAprRateCreate = vi.mocked(prisma.aprRate.create)
const mockAprRateUpdate = vi.mocked(prisma.aprRate.update)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

const mockCcAccount = {
  id: "cc-1",
  userId: "user-1",
  type: "CREDIT_CARD",
}

const mockCheckingAccount = {
  id: "chk-1",
  userId: "user-1",
  type: "CHECKING",
}

const mockRate = {
  id: "rate-1",
  rateType: "STANDARD",
  apr: decimal(0.2499),
  effectiveDate: new Date("2025-01-01"),
  expirationDate: null,
  description: "Standard purchase APR",
  isActive: true,
  accountId: "cc-1",
  account: { userId: "user-1" },
  _count: { transactions: 5 },
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── Tests: getAprRates ────────────────────────────────────────────────────────

describe("getAprRates", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getAprRates("cc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws when account not found", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(getAprRates("cc-1")).rejects.toThrow("Account not found")
  })

  it("throws when account is not a credit card", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCheckingAccount as never)
    await expect(getAprRates("chk-1")).rejects.toThrow(
      "APR rates are only available for credit card accounts"
    )
  })

  it("returns all rates with transaction counts", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCcAccount as never)
    mockAprRateFindMany.mockResolvedValue([mockRate] as never)

    const result = await getAprRates("cc-1")

    expect(result).toEqual([
      {
        id: "rate-1",
        rateType: "STANDARD",
        apr: 0.2499,
        effectiveDate: new Date("2025-01-01"),
        expirationDate: null,
        description: "Standard purchase APR",
        isActive: true,
        transactionCount: 5,
      },
    ])
  })

  it("queries with correct ordering (active first, newest first)", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCcAccount as never)
    mockAprRateFindMany.mockResolvedValue([] as never)

    await getAprRates("cc-1")

    expect(mockAprRateFindMany).toHaveBeenCalledWith({
      where: { accountId: "cc-1" },
      include: { _count: { select: { transactions: true } } },
      orderBy: [{ isActive: "desc" }, { effectiveDate: "desc" }],
    })
  })
})

// ── Tests: createAprRate ──────────────────────────────────────────────────────

describe("createAprRate", () => {
  const validInput = {
    accountId: "cc-1",
    rateType: "INTRO",
    apr: 0,
    effectiveDate: "2026-01-01",
    expirationDate: "2026-07-01",
    description: "0% intro rate",
  }

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(createAprRate(validInput)).rejects.toThrow("Unauthorized")
  })

  it("throws when account not found", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(createAprRate(validInput)).rejects.toThrow("Account not found")
  })

  it("throws when account is not a credit card", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCheckingAccount as never)
    await expect(createAprRate(validInput)).rejects.toThrow(
      "APR rates are only available for credit card accounts"
    )
  })

  it("throws when APR is negative", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCcAccount as never)
    await expect(createAprRate({ ...validInput, apr: -0.05 })).rejects.toThrow(
      "APR must be zero or positive"
    )
  })

  it("creates rate with correct data", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCcAccount as never)
    mockAprRateCreate.mockResolvedValue({
      id: "rate-new",
      rateType: "INTRO",
      apr: decimal(0),
      effectiveDate: new Date("2026-01-01"),
      expirationDate: new Date("2026-07-01"),
      description: "0% intro rate",
      isActive: true,
      accountId: "cc-1",
    } as never)

    const result = await createAprRate(validInput)

    expect(mockAprRateCreate).toHaveBeenCalledWith({
      data: {
        accountId: "cc-1",
        rateType: "INTRO",
        apr: 0,
        effectiveDate: new Date("2026-01-01"),
        expirationDate: new Date("2026-07-01"),
        description: "0% intro rate",
        isActive: true,
      },
    })
    expect(result.id).toBe("rate-new")
    expect(result.apr).toBe(0)
  })

  it("allows 0% APR rate", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCcAccount as never)
    mockAprRateCreate.mockResolvedValue({
      id: "rate-new",
      rateType: "INTRO",
      apr: decimal(0),
      effectiveDate: new Date("2026-01-01"),
      expirationDate: null,
      description: null,
      isActive: true,
      accountId: "cc-1",
    } as never)

    const result = await createAprRate({
      accountId: "cc-1",
      rateType: "INTRO",
      apr: 0,
      effectiveDate: "2026-01-01",
    })

    expect(result.apr).toBe(0)
  })

  it("handles null expiration date", async () => {
    mockAccountFindFirst.mockResolvedValue(mockCcAccount as never)
    mockAprRateCreate.mockResolvedValue({
      id: "rate-new",
      rateType: "STANDARD",
      apr: decimal(0.2499),
      effectiveDate: new Date("2026-01-01"),
      expirationDate: null,
      description: null,
      isActive: true,
      accountId: "cc-1",
    } as never)

    await createAprRate({
      accountId: "cc-1",
      rateType: "STANDARD",
      apr: 0.2499,
      effectiveDate: "2026-01-01",
    })

    expect(mockAprRateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expirationDate: null,
        description: null,
      }),
    })
  })
})

// ── Tests: updateAprRate ──────────────────────────────────────────────────────

describe("updateAprRate", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(updateAprRate("rate-1", { apr: 0.20 })).rejects.toThrow("Unauthorized")
  })

  it("throws when rate not found", async () => {
    mockAprRateFindFirst.mockResolvedValue(null as never)
    await expect(updateAprRate("rate-missing", { apr: 0.20 })).rejects.toThrow("APR rate not found")
  })

  it("throws when rate belongs to another user", async () => {
    mockAprRateFindFirst.mockResolvedValue({
      ...mockRate,
      account: { userId: "other-user" },
    } as never)

    await expect(updateAprRate("rate-1", { apr: 0.20 })).rejects.toThrow("APR rate not found")
  })

  it("throws when APR is negative", async () => {
    mockAprRateFindFirst.mockResolvedValue(mockRate as never)
    await expect(updateAprRate("rate-1", { apr: -0.01 })).rejects.toThrow(
      "APR must be zero or positive"
    )
  })

  it("updates only provided fields", async () => {
    mockAprRateFindFirst.mockResolvedValue(mockRate as never)
    mockAprRateUpdate.mockResolvedValue({
      ...mockRate,
      apr: decimal(0.1999),
    } as never)

    await updateAprRate("rate-1", { apr: 0.1999 })

    expect(mockAprRateUpdate).toHaveBeenCalledWith({
      where: { id: "rate-1" },
      data: { apr: 0.1999 },
    })
  })

  it("can clear expiration date by passing null", async () => {
    mockAprRateFindFirst.mockResolvedValue(mockRate as never)
    mockAprRateUpdate.mockResolvedValue(mockRate as never)

    await updateAprRate("rate-1", { expirationDate: null })

    expect(mockAprRateUpdate).toHaveBeenCalledWith({
      where: { id: "rate-1" },
      data: { expirationDate: null },
    })
  })

  it("returns updated rate with serialized values", async () => {
    mockAprRateFindFirst.mockResolvedValue(mockRate as never)
    mockAprRateUpdate.mockResolvedValue({
      id: "rate-1",
      rateType: "STANDARD",
      apr: decimal(0.1999),
      effectiveDate: new Date("2025-01-01"),
      expirationDate: null,
      description: "Updated APR",
      isActive: true,
    } as never)

    const result = await updateAprRate("rate-1", { apr: 0.1999, description: "Updated APR" })

    expect(result).toEqual({
      id: "rate-1",
      rateType: "STANDARD",
      apr: 0.1999,
      effectiveDate: new Date("2025-01-01"),
      expirationDate: null,
      description: "Updated APR",
      isActive: true,
    })
  })
})

// ── Tests: deleteAprRate ──────────────────────────────────────────────────────

describe("deleteAprRate", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteAprRate("rate-1")).rejects.toThrow("Unauthorized")
  })

  it("throws when rate not found", async () => {
    mockAprRateFindFirst.mockResolvedValue(null as never)
    await expect(deleteAprRate("rate-missing")).rejects.toThrow("APR rate not found")
  })

  it("throws when rate belongs to another user", async () => {
    mockAprRateFindFirst.mockResolvedValue({
      ...mockRate,
      account: { userId: "other-user" },
    } as never)

    await expect(deleteAprRate("rate-1")).rejects.toThrow("APR rate not found")
  })

  it("soft-deletes by setting isActive to false", async () => {
    mockAprRateFindFirst.mockResolvedValue(mockRate as never)
    mockAprRateUpdate.mockResolvedValue({ ...mockRate, isActive: false } as never)

    const result = await deleteAprRate("rate-1")

    expect(mockAprRateUpdate).toHaveBeenCalledWith({
      where: { id: "rate-1" },
      data: { isActive: false },
    })
    expect(result).toEqual({ success: true })
  })
})
