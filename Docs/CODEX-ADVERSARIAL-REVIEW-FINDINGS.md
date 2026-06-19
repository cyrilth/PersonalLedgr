# Codex Adversarial Review — Findings Tracker

Tracks findings raised by `/codex:adversarial-review` against the **phased student-loan
repayment** working-tree change (deferment → interest-only → full repayment).

**Scope:** working-tree diff (14 modified + 3 untracked files). Migration
`20260618000000_loan_phased_repayment` is authored but **not yet applied**.

**Status legend:** `Open` · `In Progress` · `Closed (Fixed)` · `False Positive` · `Won't Fix`

| ID | Codex Review Finding | Status | Claude Comment | Next Steps |
|----|----------------------|--------|----------------|------------|
| CR-1 | **[high]** Concurrent payoff can be overwritten by deferment interest accrual (`cron/src/jobs/loan-deferment-accrual.ts:168-235`). The job computes interest from a freshly-read account balance and claims idempotency by updating only the `Loan` row; the later `account.update` is an unconditional `decrement`. A payment that zeroes the account after the claim but before the debit lets the accrual re-post `INTEREST_CHARGED` and make a paid-off loan negative again. | **Closed (Fixed)** | **Valid, agreed — fixed.** The unconditional `tx.account.update` decrement was replaced with a balance-guarded `tx.account.updateMany({ where: { id, isActive, type LOAN/MORTGAGE, balance: { lt: 0 } }, data: { decrement } })` run **before** the `INTEREST_CHARGED` insert. Postgres re-checks the live balance under the row lock; `count !== 1` throws a `ConcurrentPayoffError` that rolls the whole txn back (watermark claim + charge both revert) and is caught as a benign SKIP (not a failure). | **Done.** Regression test: *"rolls back without charging when the account is paid off mid-run (concurrent payoff)"* (debit returns `count: 0` → no charge, no reject). Existing debit assertions retargeted to `updateMany` and now also assert the `balance: { lt: 0 }` guard. All 24 cron tests pass. |
| CR-2 | **[high]** Deferment accrual ignores payments made during the accrual window (`recordLoanPayment` allows a payment dated inside deferment). The cron assumes no payments happen during deferment, so a user who manually records a (interest) payment during deferment gets that interest double-capitalized; catch-up after an outage + payment compounds from the wrong base. | **Closed (Fixed)** | **Valid, agreed — fixed.** `recordLoanPayment` (`src/actions/loan-payments.ts`) now rejects a payment whose date lands in calendar months `[0, defermentMonths)` from `startDate`, with a user-facing "no payment is due until <month year>" error. Calendar-month indexed (`monthsElapsed`) to match the grid / `remainingLoanPhases` / cron. Guarded on `defermentMonths > 0`, so BNPL/Payday/non-deferred loans are unaffected. | **Done.** Tests: in-window rejection, allowed at the first post-deferment month (boundary), and not-blocked before `startDate` (negative index). All 31 loan-payments tests pass. |
| CR-3 | Future-start loans accrued "phantom" pre-origination deferment interest (negative `lastIdx` inflated the catch-up). | Closed (Fixed) | **Self-inflicted regression** from my earlier baseline fix, caught by review — not a false positive. The `lastDefermentAccrual = new Date()` baseline went negative for future-start loans. | Done: baseline is `max(now, startDate)` at create (`src/actions/loans.ts`); cron clamps `lastIdx = Math.max(0, …)`. Covered by `defermentMonthsToAccrue` boundary tests. |
| CR-4 | Cron used day-aware month math while the UI (`remainingLoanPhases`, payment grid) used calendar-month indexing — inconsistent windows. | Closed (Fixed) | **Valid.** My day-aware experiment made the cron disagree with the rest of the system. User chose **Option B** → revert to uniform calendar-month indexing. | Done: cron reverted to `monthsElapsed` (calendar-month). Whole system is now calendar-month-indexed end to end. |
| CR-5 | "Clearing the deferment/interest-only fields on edit sends `undefined`, so blanking them in the UI never persists." (Raised twice.) | False Positive | **Not a bug — verified twice.** The cited lines are the **create** branch (sends `undefined`); the **edit** branch (`loan-form.tsx:~251-252`) sends `null`, which `updateLoan` writes. Blanking on edit does persist. | None. Left as documented false positive to avoid re-litigating in future rounds. |
| CR-6 | **[high]** Partial payoff can still be charged interest computed from the pre-payment balance (`cron/src/jobs/loan-deferment-accrual.ts:239-247`). The CR-1 guard only rechecks that the account is still negative. A concurrent payment that drops the loan from e.g. −30000 to −10 after the txn's balance read but before the guarded `updateMany` still satisfies `balance < 0`, so the job decrements by interest computed from the stale −30000 — posting a user-visible `INTEREST_CHARGED` that grows a nearly paid-off loan by a large stale amount. A `balance < 0` guard alone is insufficient; lock the account row and compute interest from the locked balance. | Open | **Valid — agreed.** This is exactly the trade-off I labelled "accepted" in CR-1's rationale (lines 46–49 below), so it's a known gap, not a regression. The guard protects the **sign**, not the **magnitude**: `totalInterest` derives from `fresh.account.balance` (read at `findUnique`), while the guarded `updateMany` decrements the **live** balance. Where Codex is right and my note was wrong: for a near-full concurrent paydown the stale charge is **material**, not "minor." Where I'd temper the severity: probability is very low — a monthly 02:00 cron must race a balance write inside the few-round-trip window of one `$transaction`, on a loan in (or catching up) deferment; CR-2 now also blocks in-window manual payments, leaving **post-window catch-up payments** and the **recalculate** endpoint as the only realistic concurrent writers. Worth fixing before the cron is enabled because the fix is clean. | **Agreed plan — implement in a new session** (`cron/src/jobs/loan-deferment-accrual.ts`): inside the `$transaction`, after the loan-month claim, **lock the account row** with `tx.$queryRaw\`SELECT balance FROM "Account" WHERE id = ${loan.accountId} FOR UPDATE\``; recompute `totalInterest` from that **locked** balance (keep the existing compounding loop over `months`); `throw new ConcurrentPayoffError(loan.id)` if the locked balance is `>= 0`; then decrement + post `INTEREST_CHARGED` from that **same** figure. The held lock serialises any concurrent writer (payment form, recalculate, other crons) so the computed and debited amounts are identical — closing **both** CR-1 (resurrection) and CR-6 (stale magnitude); the CR-1 `balance < 0` guard may stay as defence-in-depth. **Add a regression test:** a partial paydown commits between the loan claim and the debit ⇒ the charge reflects the **post-payment** balance (or aborts), never the pre-payment one. **Rejected alternative (do not pursue):** an app-level UI lock / "is a cron running?" pre-write check — wrong layer (sub-second DB row race, not a UI concern), carries its own check-then-act race, misses server-side writers (recalc, other crons, import), and freezes all users globally; the per-row `FOR UPDATE` lock is the proportionate fix. |

---

## Detail / rationale

### CR-1 — conditional account debit (recommended fix)

Current sequence inside the cron `$transaction`:

1. `tx.loan.findUnique` reads loan + `account.balance` (snapshot under Read Committed).
2. `tx.loan.updateMany` claims the month — **locks the `Loan` row only**; the
   `account: { balance: { lt: 0 } }` predicate is evaluated via a join and does **not**
   lock the `Account` row.
3. `tx.account.update` issues a relative `{ decrement: totalInterest }` — re-reads the
   latest committed `Account.balance`, which a concurrent payment may have set to `0`.

→ `0 - interest = -interest`, so a paid-off loan reappears as owed.

Fix shape (replace the unconditional `account.update` with a guarded `updateMany`, abort by throwing if it matches nothing so the watermark + charge are rolled back together):

```ts
const debit = await tx.account.updateMany({
  where: { id: loan.accountId, isActive: true, type: { in: ["LOAN", "MORTGAGE"] }, balance: { lt: 0 } },
  data: { balance: { decrement: totalInterest } },
})
if (debit.count !== 1) throw new Error("account no longer negative — abort accrual")
```

Trade-off **originally** accepted (now reopened as **CR-6**): if a *partial* payment shrinks
(but doesn't clear) the balance between read and debit, the charge is computed on the
slightly-stale larger balance — characterised here as a minor over-charge, not a
resurrection. Eliminating that too needs `SELECT … FOR UPDATE` (raw query) to recompute
interest on the locked balance. CR-6 argues (fairly) that for a *near-full* concurrent
paydown this over-charge is material, not minor — see below.

### CR-2 — reject payments inside the deferment window

`recordLoanPayment` should refuse a payment whose `date` lands in the loan's deferment
phase, matching the grid's "not due" treatment. This removes the double-capitalization and
the wrong-base catch-up at the source rather than trying to reconcile after the fact.

### CR-6 — stale-balance over-charge after a partial payoff (reopens CR-1's trade-off)

The CR-1 guard catches a **full** payoff (balance → 0 ⇒ `< 0` fails ⇒ abort) but not a
**partial** one (balance → −10 ⇒ `< 0` still true). The root cause is an
order-of-operations gap: interest is computed from the balance read at `tx.loan.findUnique`,
but the guarded debit only re-checks the *sign* of the live balance, never recomputing the
*amount* from it.

Correct fix — **lock, then compute** (single row lock makes the computed and debited figures
identical):

```ts
// after the loan-month claim, before computing interest:
const rows = await tx.$queryRaw<{ balance: unknown }[]>`
  SELECT balance FROM "Account" WHERE id = ${loan.accountId} FOR UPDATE`
const liveBalance = Number(rows[0]?.balance ?? 0)
if (liveBalance >= 0) throw new ConcurrentPayoffError(loan.id) // covers CR-1 too
// compound totalInterest from Math.abs(liveBalance) over `months`,
// then decrement + post INTEREST_CHARGED from that same value.
```

With the account row locked `FOR UPDATE`, no concurrent payment/recalc can mutate the balance
until the accrual commits, so the value interest is computed on is exactly the value it is
applied to. This supersedes the balance-guarded `updateMany` from CR-1 (the `FOR UPDATE` lock
already serialises the writers) — though keeping the guarded write as defence-in-depth is
harmless.

---

*CR-1 + CR-2 implemented (tests green: **1013 passed**, app `tsc` clean, touched files lint
clean). **CR-6 is Open with an agreed fix** (`SELECT … FOR UPDATE` before computing interest —
see its Next Steps for the full plan) **deferred to a new session** to save tokens; no code for
it has been written. The app-level UI-lock alternative was considered and **rejected** (wrong
layer). All changes are uncommitted; the migration `20260618000000_loan_phased_repayment` is
still unapplied.*
