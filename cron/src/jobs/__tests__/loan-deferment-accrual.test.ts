/**
 * Tests for the monthly loan deferment interest accrual job.
 *
 * Key behaviours under test:
 *  - Monthly interest = |balance| × (interestRate / 100 / 12), rounded to cents
 *  - Capitalizes by posting an INTEREST_CHARGED transaction (negative = grows the
 *    debt) and decrementing the account balance, inside one Prisma transaction
 *  - Re-reads the loan + account UNDER the transaction; eligibility and the
 *    accrual window are recomputed from those fresh fields, so a since-edited loan
 *    (subsidized, future start, deferment removed) can't move money on stale data
 *  - Does NOT write an InterestLog entry (capitalized interest is charged, not paid)
 *  - Atomically claims the month with a conditional updateMany; count 0 → no post
 *  - Catches up months missed during an outage (compounded), including the final
 *    deferment month even when the run resumes after the window has ended
 *  - A loan with no prior accrual only takes the current month
 *  - Per-loan errors are isolated and do not abort the rest
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import Decimal from "decimal.js"

// ── Mock ../../db ─────────────────────────────────────────────────────────────

vi.mock("../../db", () => {
  const txClient = {
    transaction: { create: vi.fn() },
    account: { updateMany: vi.fn() }, // conditional, balance-guarded debit
    loan: { findUnique: vi.fn(), updateMany: vi.fn() }, // fresh re-read + atomic claim
    interestLog: { create: vi.fn() }, // present so we can assert it is NOT used
  }
  return {
    prisma: {
      loan: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runLoanDefermentAccrual, defermentMonthsToAccrue } from "../loan-deferment-accrual"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockLoanFindMany = vi.mocked(prisma.loan.findMany)
const txClient = (prisma as unknown as {
  _txClient: {
    transaction: { create: ReturnType<typeof vi.fn> }
    account: { updateMany: ReturnType<typeof vi.fn> }
    loan: { findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }
    interestLog: { create: ReturnType<typeof vi.fn> }
  }
})._txClient

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A date `n` whole months before "now" (on the 1st), for window math. */
function monthsBeforeNow(n: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - n, 1)
}

/**
 * Builds a loan row. The same shape is used for both the findMany snapshot and
 * the in-transaction `loan.findUnique` re-read (the job picks the fields it needs
 * from each), so a test can keep snapshot and fresh consistent via primeLoan().
 */
function makeDeferredLoan(overrides: {
  id?: string
  accountId?: string
  name?: string
  balance?: number
  interestRate?: number
  defermentMonths?: number
  startDate?: Date
  lastDefermentAccrual?: Date | null
  subsidized?: boolean
  isActive?: boolean
  type?: string
  userId?: string
} = {}) {
  const accountId = overrides.accountId ?? "acc-1"
  return {
    id: overrides.id ?? "loan-1",
    accountId,
    subsidized: overrides.subsidized ?? false,
    interestRate: new Decimal(overrides.interestRate ?? 6),
    defermentMonths: overrides.defermentMonths ?? 12,
    startDate: overrides.startDate ?? monthsBeforeNow(3),
    lastDefermentAccrual:
      overrides.lastDefermentAccrual === undefined ? null : overrides.lastDefermentAccrual,
    account: {
      id: accountId,
      name: overrides.name ?? "SoFi Student Loan",
      isActive: overrides.isActive ?? true,
      type: overrides.type ?? "LOAN",
      balance: new Decimal(overrides.balance ?? -30000),
      userId: overrides.userId ?? "user-1",
    },
  }
}

/** Make the same loan the result of both findMany (snapshot) and findUnique (fresh). */
function primeLoan(overrides: Parameters<typeof makeDeferredLoan>[0] = {}) {
  const loan = makeDeferredLoan(overrides)
  mockLoanFindMany.mockResolvedValue([loan] as never)
  txClient.loan.findUnique.mockResolvedValue(loan as never)
  return loan
}

beforeEach(() => {
  vi.clearAllMocks()
  txClient.transaction.create.mockResolvedValue({})
  txClient.account.updateMany.mockResolvedValue({ count: 1 }) // debit matches by default
  txClient.loan.findUnique.mockResolvedValue(makeDeferredLoan() as never) // fresh re-read default
  txClient.loan.updateMany.mockResolvedValue({ count: 1 }) // claim succeeds by default
  txClient.interestLog.create.mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runLoanDefermentAccrual", () => {
  it("exits early without writing when there are no deferred loans", async () => {
    mockLoanFindMany.mockResolvedValue([])

    await runLoanDefermentAccrual()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("capitalizes one month of interest for an in-deferment unsubsidized loan", async () => {
    // balance=-30000, rate=6% → 30000 × (6/100/12) = $150.00
    primeLoan()

    await runLoanDefermentAccrual()

    expect(prisma.$transaction).toHaveBeenCalledOnce()

    const txCall = txClient.transaction.create.mock.calls[0][0]
    expect(txCall.data.type).toBe("INTEREST_CHARGED")
    expect(txCall.data.source).toBe("SYSTEM")
    expect(txCall.data.category).toBe("Interest")
    expect(txCall.data.amount).toBe(-150) // negative = grows the debt
    expect(txCall.data.accountId).toBe("acc-1")
    expect(txCall.data.userId).toBe("user-1")

    const updateCall = txClient.account.updateMany.mock.calls[0][0]
    expect(updateCall.where.id).toBe("acc-1")
    // The debit only matches while the account is still negative (concurrent-payoff guard).
    expect(updateCall.where.balance).toEqual({ lt: 0 })
    expect(updateCall.data.balance.decrement).toBe(150)
  })

  it("computes interest from the in-transaction re-read, not the stale snapshot", async () => {
    // The findMany snapshot says -30000, but a payment landed first, so the fresh
    // re-read inside the transaction returns -20000. Interest follows the fresh
    // value: 20000 × 6%/12 = $100 (not 30000 × 6%/12 = $150).
    mockLoanFindMany.mockResolvedValue([makeDeferredLoan({ balance: -30000 })] as never)
    txClient.loan.findUnique.mockResolvedValue(makeDeferredLoan({ balance: -20000 }) as never)

    await runLoanDefermentAccrual()

    expect(txClient.transaction.create.mock.calls[0][0].data.amount).toBe(-100)
    expect(txClient.account.updateMany.mock.calls[0][0].data.balance.decrement).toBe(100)
  })

  it("catches up missed months in one compounded charge after an outage", async () => {
    // Started 5 months ago, last accrued 3 months ago (cron down ~2 months),
    // still inside a 12-month deferment → 3 months to catch up. Rate 12% = 1%/mo
    // on $10,000: 100 + 101 + 102.01 = 303.01 compounded.
    primeLoan({
      interestRate: 12,
      defermentMonths: 12,
      startDate: monthsBeforeNow(5),
      lastDefermentAccrual: monthsBeforeNow(3),
      balance: -10000,
    })

    await runLoanDefermentAccrual()

    expect(txClient.transaction.create.mock.calls[0][0].data.amount).toBe(-303.01)
    expect(txClient.account.updateMany.mock.calls[0][0].data.balance.decrement).toBe(303.01)
  })

  it("catches up the final deferment month even after the window has ended", async () => {
    // 12-month deferment started 12 months ago → now (idx 12) is one past the
    // window end (idx 11). Last accrued 2 months ago (idx 10), so the final
    // in-window month (idx 11) was missed and must still be caught up.
    primeLoan({
      interestRate: 12,
      defermentMonths: 12,
      startDate: monthsBeforeNow(12),
      lastDefermentAccrual: monthsBeforeNow(2),
      balance: -10000,
    })

    await runLoanDefermentAccrual()

    // Exactly one month (the final one): 10000 × 1% = 100.
    expect(txClient.transaction.create.mock.calls[0][0].data.amount).toBe(-100)
  })

  it("recovers a missed first run for an origination loan (baselined watermark)", async () => {
    // Created at origination with the watermark baselined to the start date
    // (lastIdx 0). The first scheduled run was missed, so now (2 months in) two
    // months must be caught up — proving a new loan's early months aren't lost
    // the way a null watermark would lose them.
    primeLoan({
      interestRate: 12,
      defermentMonths: 12,
      startDate: monthsBeforeNow(2),
      lastDefermentAccrual: monthsBeforeNow(2),
      balance: -10000,
    })

    await runLoanDefermentAccrual()

    // 2 compounded months: 100 + 101 = 201.
    expect(txClient.transaction.create.mock.calls[0][0].data.amount).toBe(-201)
  })

  it("does not post phantom months when the watermark predates the start date", async () => {
    // A watermark before the start date (e.g. a future-start loan, or legacy
    // data) yields a negative raw index. It must clamp to 0 rather than treating
    // pre-origination months as missed deferment.
    primeLoan({
      interestRate: 12,
      defermentMonths: 12,
      startDate: monthsBeforeNow(1),
      lastDefermentAccrual: monthsBeforeNow(4), // 3 months before the start date
      balance: -10000,
    })

    await runLoanDefermentAccrual()

    // Clamped: only the 1 month since start (10000 × 1% = 100), not 4 months.
    expect(txClient.transaction.create.mock.calls[0][0].data.amount).toBe(-100)
  })

  it("only accrues the current month for a loan with no prior accrual", async () => {
    // No watermark → the elapsed deferment is assumed already in the balance, so
    // we capitalize just one month (not the months since start).
    primeLoan({
      interestRate: 12,
      defermentMonths: 12,
      startDate: monthsBeforeNow(5),
      lastDefermentAccrual: null,
      balance: -10000,
    })

    await runLoanDefermentAccrual()

    // One month only: 10000 × 1% = 100 (not 5 months).
    expect(txClient.transaction.create.mock.calls[0][0].data.amount).toBe(-100)
  })

  it("does not post when the loan was edited to subsidized after the snapshot", async () => {
    // Snapshot was eligible, but the fresh re-read shows it's now subsidized —
    // interest must not accrue, and no money moves.
    mockLoanFindMany.mockResolvedValue([makeDeferredLoan()] as never)
    txClient.loan.findUnique.mockResolvedValue(makeDeferredLoan({ subsidized: true }) as never)

    await runLoanDefermentAccrual()

    expect(txClient.loan.updateMany).not.toHaveBeenCalled() // never even claimed
    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(txClient.account.updateMany).not.toHaveBeenCalled()
  })

  it("does not post when the loan was edited to a future start date after the snapshot", async () => {
    const now = new Date()
    const futureStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    mockLoanFindMany.mockResolvedValue([makeDeferredLoan()] as never)
    txClient.loan.findUnique.mockResolvedValue(
      makeDeferredLoan({ startDate: futureStart }) as never,
    )

    await runLoanDefermentAccrual()

    expect(txClient.loan.updateMany).not.toHaveBeenCalled()
    expect(txClient.transaction.create).not.toHaveBeenCalled()
  })

  it("does not write an InterestLog entry (capitalized interest is not 'paid')", async () => {
    primeLoan()

    await runLoanDefermentAccrual()

    expect(txClient.interestLog.create).not.toHaveBeenCalled()
  })

  it("atomically claims the month via a conditional watermark update", async () => {
    primeLoan()

    await runLoanDefermentAccrual()

    expect(txClient.loan.updateMany).toHaveBeenCalledOnce()
    const claimCall = txClient.loan.updateMany.mock.calls[0][0]
    expect(claimCall.where.id).toBe("loan-1")
    // The claim only matches when the watermark predates the current month.
    expect(claimCall.where.OR).toBeDefined()
    // ...and re-asserts durable eligibility so a since-edited loan matches zero rows.
    expect(claimCall.where.subsidized).toBe(false)
    expect(claimCall.where.defermentMonths).toEqual({ gt: 0 })
    expect(claimCall.where.account).toMatchObject({ isActive: true })
    expect(claimCall.data.lastDefermentAccrual).toBeInstanceOf(Date)
  })

  it("does not move money when another run already claimed the month (count 0)", async () => {
    // Simulate losing the race: the conditional claim matches zero rows.
    primeLoan()
    txClient.loan.updateMany.mockResolvedValue({ count: 0 })

    await runLoanDefermentAccrual()

    expect(prisma.$transaction).toHaveBeenCalledOnce() // the claim was attempted
    expect(txClient.transaction.create).not.toHaveBeenCalled() // but no charge posted
    expect(txClient.account.updateMany).not.toHaveBeenCalled() // and no balance change
  })

  it("rolls back without charging when the account is paid off mid-run (concurrent payoff)", async () => {
    // The loan claim succeeds, but a concurrent payment zeroes the account before
    // the debit, so the balance-guarded updateMany matches zero rows. The accrual
    // must abort (roll back) rather than resurrect the paid-off loan to -interest.
    primeLoan()
    txClient.account.updateMany.mockResolvedValue({ count: 0 }) // payoff won the race

    // The job swallows the rollback as a benign skip — it must not reject.
    await expect(runLoanDefermentAccrual()).resolves.toBeUndefined()

    expect(txClient.loan.updateMany).toHaveBeenCalledOnce() // the month was claimed...
    expect(txClient.account.updateMany).toHaveBeenCalledOnce() // ...the debit was attempted...
    expect(txClient.transaction.create).not.toHaveBeenCalled() // ...but no charge was posted
  })

  it("does not accrue before a loan's start date (future same-month start)", async () => {
    // Start "tomorrow" — same calendar month on all but month-end, so the snapshot
    // pre-check still skips it because the loan has not originated as of the run.
    const now = new Date()
    const futureStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0)
    primeLoan({ startDate: futureStart, lastDefermentAccrual: null })

    await runLoanDefermentAccrual()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("skips a never-accrued loan whose deferment window has already ended", async () => {
    // 24 months in with a 12-month deferment and no prior accrual → nothing left.
    primeLoan({ startDate: monthsBeforeNow(24), defermentMonths: 12, lastDefermentAccrual: null })

    await runLoanDefermentAccrual()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("skips a loan already accrued in the current calendar month", async () => {
    primeLoan({ lastDefermentAccrual: new Date() })

    await runLoanDefermentAccrual()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("continues processing remaining loans when one fails", async () => {
    mockLoanFindMany.mockResolvedValue([
      makeDeferredLoan({ id: "loan-1", accountId: "acc-1" }),
      makeDeferredLoan({ id: "loan-2", accountId: "acc-2" }),
    ] as never)

    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(new Error("DB connection lost"))
      .mockImplementation((fn: (tx: unknown) => unknown) => fn(txClient) as Promise<unknown>)

    await expect(runLoanDefermentAccrual()).resolves.toBeUndefined()

    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })
})

// ── defermentMonthsToAccrue (date/window math, deterministic) ────────────────

describe("defermentMonthsToAccrue", () => {
  /** Build a Date with a 1-based month for readability. */
  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

  it("returns 0 before the loan has started", () => {
    expect(defermentMonthsToAccrue(d(2026, 6, 1), 12, null, d(2026, 5, 15))).toBe(0)
  })

  it("counts one month at the next calendar-month boundary (calendar-month model)", () => {
    // The whole system is calendar-month-indexed (monthly grid + 1st-of-month
    // cron + remainingLoanPhases), so the first deferment month is the first
    // calendar rollover, regardless of the start's day of month.
    expect(defermentMonthsToAccrue(d(2026, 6, 1), 12, d(2026, 6, 1), d(2026, 7, 1))).toBe(1)
    expect(defermentMonthsToAccrue(d(2026, 6, 30), 12, d(2026, 6, 30), d(2026, 7, 1))).toBe(1)
  })

  it("catches up whole months missed since the watermark", () => {
    // Started Jan 1, last accrued Mar 1, now Jun 1 → Apr, May, Jun = 3 months.
    expect(defermentMonthsToAccrue(d(2026, 1, 1), 12, d(2026, 3, 1), d(2026, 6, 1))).toBe(3)
  })

  it("recovers the final deferment month even past the window end", () => {
    // 12-month deferment from Jan 2026 (window end idx 11). Last accrued idx 10
    // (Nov 1), now idx 12 (Jan 1 2027) → catch up the missed final month.
    expect(defermentMonthsToAccrue(d(2026, 1, 1), 12, d(2026, 11, 1), d(2027, 1, 1))).toBe(1)
  })

  it("clamps a watermark that predates the start (no phantom months)", () => {
    // Last accrual before start → negative raw index clamps to 0.
    expect(defermentMonthsToAccrue(d(2026, 6, 1), 12, d(2026, 3, 1), d(2026, 7, 1))).toBe(1)
  })

  it("returns 0 once the deferment window is fully accrued", () => {
    // Watermark already at the final month index → nothing left.
    expect(defermentMonthsToAccrue(d(2026, 1, 1), 12, d(2026, 12, 1), d(2027, 3, 1))).toBe(0)
  })
})
