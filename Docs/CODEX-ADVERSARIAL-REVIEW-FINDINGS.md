# Codex Adversarial Review — Findings Tracker

Tracks findings raised by `/codex:adversarial-review` against the **phased student-loan
repayment** working-tree change (deferment → interest-only → full repayment).

**Scope:** working-tree diff (original round: 14 modified + 3 untracked files). Migration
`20260618000000_loan_phased_repayment` has been **applied** (`prisma migrate deploy`).

**Status legend:** `Open` · `In Progress` · `Closed (Fixed)` · `False Positive` · `Won't Fix`

| ID | Codex Review Finding | Status | Claude Comment | Next Steps |
|----|----------------------|--------|----------------|------------|
| CR-1 | **[high]** Concurrent payoff can be overwritten by deferment interest accrual (`cron/src/jobs/loan-deferment-accrual.ts:168-235`). The job computes interest from a freshly-read account balance and claims idempotency by updating only the `Loan` row; the later `account.update` is an unconditional `decrement`. A payment that zeroes the account after the claim but before the debit lets the accrual re-post `INTEREST_CHARGED` and make a paid-off loan negative again. | **Closed (Fixed)** | **Valid, agreed — fixed.** The unconditional `tx.account.update` decrement was replaced with a balance-guarded `tx.account.updateMany({ where: { id, isActive, type LOAN/MORTGAGE, balance: { lt: 0 } }, data: { decrement } })` run **before** the `INTEREST_CHARGED` insert. Postgres re-checks the live balance under the row lock; `count !== 1` throws a `ConcurrentPayoffError` that rolls the whole txn back (watermark claim + charge both revert) and is caught as a benign SKIP (not a failure). | **Done.** Regression test: *"rolls back without charging when the account is paid off mid-run (concurrent payoff)"* (debit returns `count: 0` → no charge, no reject). Existing debit assertions retargeted to `updateMany` and now also assert the `balance: { lt: 0 }` guard. All 24 cron tests pass. |
| CR-2 | **[high]** Deferment accrual ignores payments made during the accrual window (`recordLoanPayment` allows a payment dated inside deferment). The cron assumes no payments happen during deferment, so a user who manually records a (interest) payment during deferment gets that interest double-capitalized; catch-up after an outage + payment compounds from the wrong base. | **Closed (Fixed)** | **Valid, agreed — fixed.** `recordLoanPayment` (`src/actions/loan-payments.ts`) now rejects a payment whose date lands in calendar months `[0, defermentMonths)` from `startDate`, with a user-facing "no payment is due until <month year>" error. Calendar-month indexed (`monthsElapsed`) to match the grid / `remainingLoanPhases` / cron. Guarded on `defermentMonths > 0`, so BNPL/Payday/non-deferred loans are unaffected. | **Done.** Tests: in-window rejection, allowed at the first post-deferment month (boundary), and not-blocked before `startDate` (negative index). All 31 loan-payments tests pass. |
| CR-3 | Future-start loans accrued "phantom" pre-origination deferment interest (negative `lastIdx` inflated the catch-up). | Closed (Fixed) | **Self-inflicted regression** from my earlier baseline fix, caught by review — not a false positive. The `lastDefermentAccrual = new Date()` baseline went negative for future-start loans. | Done: baseline is `max(now, startDate)` at create (`src/actions/loans.ts`); cron clamps `lastIdx = Math.max(0, …)`. Covered by `defermentMonthsToAccrue` boundary tests. |
| CR-4 | Cron used day-aware month math while the UI (`remainingLoanPhases`, payment grid) used calendar-month indexing — inconsistent windows. | Closed (Fixed) | **Valid.** My day-aware experiment made the cron disagree with the rest of the system. User chose **Option B** → revert to uniform calendar-month indexing. | Done: cron reverted to `monthsElapsed` (calendar-month). Whole system is now calendar-month-indexed end to end. |
| CR-5 | "Clearing the deferment/interest-only fields on edit sends `undefined`, so blanking them in the UI never persists." (Raised twice.) | False Positive | **Not a bug — verified twice.** The cited lines are the **create** branch (sends `undefined`); the **edit** branch (`loan-form.tsx:~251-252`) sends `null`, which `updateLoan` writes. Blanking on edit does persist. | None. Left as documented false positive to avoid re-litigating in future rounds. |
| CR-6 | **[high]** Partial payoff can still be charged interest computed from the pre-payment balance (`cron/src/jobs/loan-deferment-accrual.ts:239-247`). The CR-1 guard only rechecks that the account is still negative. A concurrent payment that drops the loan from e.g. −30000 to −10 after the txn's balance read but before the guarded `updateMany` still satisfies `balance < 0`, so the job decrements by interest computed from the stale −30000 — posting a user-visible `INTEREST_CHARGED` that grows a nearly paid-off loan by a large stale amount. A `balance < 0` guard alone is insufficient; lock the account row and compute interest from the locked balance. | Closed (Fixed) | **Valid — agreed; fixed.** This is exactly the trade-off I labelled "accepted" in CR-1's rationale (lines 46–49 below), so it's a known gap, not a regression. The guard protects the **sign**, not the **magnitude**: `totalInterest` derives from `fresh.account.balance` (read at `findUnique`), while the guarded `updateMany` decrements the **live** balance. Where Codex is right and my note was wrong: for a near-full concurrent paydown the stale charge is **material**, not "minor." Where I'd temper the severity: probability is very low — a monthly 02:00 cron must race a balance write inside the few-round-trip window of one `$transaction`, on a loan in (or catching up) deferment; CR-2 now also blocks in-window manual payments, leaving **post-window catch-up payments** and the **recalculate** endpoint as the only realistic concurrent writers. Worth fixing before the cron is enabled because the fix is clean. | **Done** (`cron/src/jobs/loan-deferment-accrual.ts`). Inside the `$transaction`, after the loan-month claim, the account row is now locked with `tx.$queryRaw\`SELECT balance FROM "Account" WHERE id = ${loan.accountId} FOR UPDATE\``; `totalInterest` is recomputed from that **locked** `liveBalance` (same compounding loop over `months`); a `>= 0` locked balance throws `ConcurrentPayoffError` (rolls the claim back); the decrement + `INTEREST_CHARGED` (and its `notes` balance figure) all derive from the **same** locked value. The held lock serialises every concurrent writer (payment form, recalculate, sibling crons) so the computed and debited amounts are identical — closing **both** CR-1 (resurrection) and CR-6 (stale magnitude). The CR-1 `balance < 0` guarded `updateMany` is kept as harmless defence-in-depth. **Regression tests added:** *"computes interest from the FOR UPDATE-locked balance after a concurrent partial paydown (CR-6)"* (re-read sees −30000, locked sees −10000 ⇒ charge is $50, not $150) and *"aborts before debiting when the FOR UPDATE-locked balance is non-negative (CR-6 full payoff)"* (locked 0 ⇒ claimed but no debit/charge). The happy-path test also asserts the `FOR UPDATE` lock SQL is issued. All 26 deferment tests pass (full suite **1015 passed**); cron production file `tsc`-clean and both touched files lint-clean (one pre-existing test-mock `$transaction` cast error, unchanged). **Rejected alternative (not pursued):** an app-level UI lock / "is a cron running?" pre-write check — wrong layer (sub-second DB row race, not a UI concern), carries its own check-then-act race, misses server-side writers (recalc, other crons, import), and freezes all users globally; the per-row `FOR UPDATE` lock is the proportionate fix. |
| CR-7 | **[high]** Recalculate can still clobber a just-capitalized deferment charge (`src/actions/accounts.ts:591-610`, lines 597-607). The new cron `FOR UPDATE` lock only makes *relative* `Account` updates wait; it does not force `confirmRecalculate` to recompute after waiting. `confirmRecalculate` does `transaction.aggregate → calculated` (read) then `account.update({ balance: calculated })` (absolute overwrite) as **two separate, non-transactional** Prisma calls. If the aggregate runs while the cron txn is still uncommitted, the later absolute `account.update` can block on the cron's `FOR UPDATE` row lock, resume after the cron commits its `decrement` + `INTEREST_CHARGED`, and overwrite the stored balance with the **stale pre-interest** value — leaving a committed interest transaction in the ledger with no balance effect. So CR-6's stated "recalculate" writer is still not serialized. Same pattern in `confirmRecalculateAll`. Recommendation: serialize recalc as a read-compute-write — lock the `Account` row with `SELECT … FOR UPDATE` inside one `$transaction`, then aggregate and overwrite; or add a version/retry check. | Closed (Fixed) | **Valid — agreed; fixed.** Verified `confirmRecalculate` (`accounts.ts:591-610`): three separate top-level `prisma.*` calls (`findFirst` → `aggregate` → absolute `update`), **not** wrapped in a `$transaction`. The mechanism holds: the aggregate reads a snapshot that excludes the cron's in-flight `INTEREST_CHARGED`; the absolute `account.update` then blocks on the cron's `FOR UPDATE` lock but writes a *constant* `calculated` computed **before** the cron was visible — so the lock serializes the *write order* but not the *read*, and the cron's contribution is silently dropped. My **CR-6 note overclaimed**: the `FOR UPDATE` lock correctly serializes *relative* (`decrement`/`increment`) writers — Postgres re-evaluates `balance = balance − x` under the lock — but cannot protect an absolute overwrite whose read happened outside the lock. **Nuance / severity:** this is a **pre-existing** race in `confirmRecalculate`, **not** introduced by the CR-6 diff — the action has always been a non-transactional read-then-absolute-write, racy against *any* concurrent balance writer (payments, CC-interest cron, statement-close). CR-6 made the cron's *interest math* correct; it did not (and a row lock alone cannot) fix a separate unserialized writer. Probability is low — a user-triggered settings-page recalc must land inside the monthly 02:00 cron's few-round-trip `$transaction` window on the same loan account — but the irony (the drift-repair tool *causing* drift) and the clean fix justify addressing it. `confirmRecalculateAll` (`accounts.ts:656-687`) has the identical pattern and can touch deferred loan accounts. | **Done** (`src/actions/accounts.ts`). Both `confirmRecalculate` (single) and `confirmRecalculateAll` (per-account, inside the `Promise.all` map) now wrap their read-compute-write in a `prisma.$transaction` that locks the account row **first** — `tx.$queryRaw\`SELECT … FROM "Account" WHERE id = ${id} FOR UPDATE\`` — then runs `tx.transaction.aggregate` and the absolute `tx.account.update` under the held lock. So the cron and recalc mutually exclude on the `Account` row: whichever runs second re-derives from the other's committed result (cron→recalc: the aggregate now includes `INTEREST_CHARGED`; recalc→cron: the cron reads the recalculated `liveBalance`). `confirmRecalculateAll`'s skip-when-no-drift check now compares against the **live locked** balance (`SELECT balance … FOR UPDATE`), not the pre-lock `findMany` snapshot. The read-only `recalculateBalance` / `recalculateAllBalances` drift *reports* are unchanged (no write → no race). The CR-6 over-claim is corrected inline in this doc (a `> Correction` note under the CR-6 detail). **Regression tests added** (`accounts.test.ts`): *"locks before it aggregates so the sum reflects writes committed first (CR-7)"* (asserts order lock → aggregate → write) and *"decides drift from the LIVE locked balance, not the pre-lock snapshot (CR-7)"* (snapshot 1000 vs live 1050 ⇒ no overwrite); existing confirm tests retargeted to the tx client and assert the `FOR UPDATE` SQL. All 75 accounts tests pass (full suite **1017 passed**), app `tsc`-clean, touched files lint-clean. **Alternative considered:** optimistic version column + retry — viable but adds a schema column + retry loop; the `FOR UPDATE` read-compute-write is consistent with the CR-6 fix and needs no migration. |
| CR-8 | **[medium]** Account `FOR UPDATE` lock can deadlock with concurrent ledger inserts (`src/actions/accounts.ts:611,692`). The CR-7 fix takes `SELECT … FOR UPDATE` on `Account`. That conflicts with the `FOR KEY SHARE` lock Postgres takes on the referenced `Account` row when a `Transaction` (FK `accountId`) is inserted. Several balance writers insert the ledger row **before** updating the account balance — e.g. `createTransaction` does `tx.transaction.create` (`transactions.ts:223`) then `tx.account.update` (`:238`). If recalc queues `FOR UPDATE` after the insert's `KEY SHARE` but before the writer's account update, the writer then queues its account update behind recalc while recalc waits on the writer's `KEY SHARE` → Postgres aborts one side as a deadlock (40P01); a normal transaction/payment/import fails without retry. Recommendation: use `FOR NO KEY UPDATE` for the recalc lock — it still conflicts with balance updates and the cron's row lock, but not with FK `KEY SHARE` inserts. Add a concurrency regression test. | Closed (Fixed) | **Valid — agreed; fixed.** Confirmed the lock mechanism and every premise: (1) `Transaction.accountId` is an FK to `Account` (`schema.prisma:246`, `onDelete: Cascade`), so inserting a `Transaction` takes `FOR KEY SHARE` on the parent `Account` row. (2) `createTransaction` (`transactions.ts:222-241`) inserts the ledger row first, then a **relative** `account.update({ balance: { increment } })` — the insert-before-update order cited; payment/transfer/import paths share the shape. (3) Per the PG row-lock matrix, `FOR UPDATE` **conflicts** with `FOR KEY SHARE` while `FOR NO KEY UPDATE` does **not**; a plain `UPDATE Account SET balance=…` already takes `FOR NO KEY UPDATE` (balance isn't a key), and `FOR NO KEY UPDATE` still conflicts with itself and with `FOR UPDATE` — so downgrading keeps all the serialisation CR-6/CR-7 rely on while dropping the spurious FK conflict. **Severity — medium, agreed:** a transient deadlock (one side aborts, **no** corruption / wrong balance), but two amplifiers: (a) `confirmRecalculateAll` locks **every active account** (in `Promise.all`), so a bulk recalc widens the collision surface to any concurrent insert on any account; (b) **no retry** — the victim surfaces a raw 40P01. **Scope correction — the cron shares this bug:** Codex scoped to CR-7, but the CR-6 fix uses the identical `SELECT balance … FOR UPDATE` (`loan-deferment-accrual.ts:237`), with the same FK-`KEY SHARE` exposure against concurrent `Transaction` inserts on a loan account (post-window catch-up payments, imports, CC-interest cron). `FOR NO KEY UPDATE` is in fact the *semantically correct* strength there too: the cron only needs to block balance **updates** (which mutate the column it reads), not balance-neutral row **inserts**. All three lock sites should downgrade. **Why NO KEY UPDATE stays correct for recalc:** concurrent writers use **relative** deltas; NO KEY UPDATE still serialises them against recalc's absolute overwrite, so a writer that loses the race re-applies its delta on top of recalc's committed sum (and its row is counted next recalc) — no lost update, which was the entire point of CR-7. | **Done.** All three lock statements downgraded `… FOR UPDATE` → `… FOR NO KEY UPDATE`: `accounts.ts` `confirmRecalculate` (`SELECT id …`), `accounts.ts` `confirmRecalculateAll` (`SELECT balance …`), and `cron/src/jobs/loan-deferment-accrual.ts` (`SELECT balance …`). Surrounding comments/JSDoc updated to explain the mode choice (FK `KEY SHARE` vs `FOR UPDATE` deadlock; NO KEY UPDATE still serialises balance writers + the cron, just not FK inserts). Existing `/FOR UPDATE/i` SQL assertions re-pointed to `/FOR NO KEY UPDATE/i` in both test files. **Regression-test note (honest gap):** the mock-level suites have no real DB, so they assert the lock **mode** in the emitted SQL (proves we request `FOR NO KEY UPDATE`) — they cannot reproduce an actual lock cycle. A Postgres-backed integration test (insert-before-account-update racing a recalc) would be the only way to prove the deadlock is truly gone; the repo has no integration harness today, so that is **explicitly left as a gap**, not silently skipped. **Rejected alternative:** app-level retry on 40P01 — masks the cycle rather than removing it; the FK-compatible lock mode removes it at the source. **Unchanged:** the CR-1 balance-guarded `updateMany` (defence-in-depth) and the read-only `recalculateBalance`/`recalculateAllBalances` reports (no lock, no write → no race). Full suite **1017 passed**, app `tsc`-clean, cron production file `tsc`-clean, all four touched files lint-clean. |

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

> **Correction (see CR-7):** the lock serialises *relative* writers (`{ decrement }` /
> `{ increment }`), which re-evaluate `balance = balance ± x` under the lock. It does **not**
> serialise an *absolute* overwrite (`{ balance: <constant> }`) whose value was computed from a
> read taken before the lock — exactly what `confirmRecalculate` does. The CR-6 claim that the
> lock "serialises recalculate" was too strong.

### CR-7 — recalculate's non-transactional absolute overwrite isn't serialised by the cron lock

`confirmRecalculate` (and `confirmRecalculateAll`) compute the balance as the sum of
balance-impacting transactions and then **overwrite** the stored balance with that absolute
value. The read and the write are separate, non-transactional Prisma calls:

```ts
// confirmRecalculate — src/actions/accounts.ts:597-607 (NOT inside a $transaction)
const result = await prisma.transaction.aggregate({
  where: balanceTransactionWhere(account),
  _sum: { amount: true },
})
const calculated = toNumber(result._sum.amount ?? 0) // snapshot — misses the cron's in-flight INTEREST_CHARGED
await prisma.account.update({ where: { id }, data: { balance: calculated } }) // absolute overwrite
```

Race with the deferment cron:

1. recalc's `aggregate` runs while the cron `$transaction` is uncommitted → `calculated`
   excludes the cron's not-yet-committed `INTEREST_CHARGED`.
2. The cron commits (balance decremented + `INTEREST_CHARGED` inserted) and releases its
   `FOR UPDATE` lock.
3. recalc's `account.update({ balance: calculated })` (which was blocked on that lock) resumes
   and writes the **stale** `calculated`, dropping the cron's charge from the balance while the
   transaction stays in the ledger → fresh drift, created by the drift-repair tool.

Why the CR-6 lock can't fix it: blocking the *write* on the lock only delays the clobber; the
value being written was already computed from a pre-lock read. Relative deltas are safe because
Postgres recomputes them against the post-commit balance under the lock; an absolute constant is
not recomputed.

Correct fix — lock first, then read+write in one transaction:

```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE` // serialise vs cron/payments
  const sum = await tx.transaction.aggregate({
    where: balanceTransactionWhere(account),
    _sum: { amount: true },
  })
  await tx.account.update({ where: { id }, data: { balance: toNumber(sum._sum.amount ?? 0) } })
})
```

Scope: this race **predates** the phased-repayment work — `confirmRecalculate` has always been a
non-transactional read-then-absolute-write, racy against any concurrent balance writer. CR-6
corrected the cron's interest computation; it did not introduce CR-7, and the cron lock alone
cannot close it. Tracked as its own item.

### CR-8 — `FOR UPDATE` deadlocks against FK `KEY SHARE` from ledger inserts (introduced by CR-6/CR-7)

The lock mode chosen for CR-6/CR-7 is too strong. Inserting a child row with an FK takes a
`FOR KEY SHARE` lock on the *referenced* parent row (PG ≥ 9.3). Every `Transaction` carries an
FK to `Account` (`schema.prisma:246`), so creating any ledger row locks that `Account` with
`KEY SHARE`. Balance writers insert the row **before** updating the balance:

```ts
// createTransaction — src/actions/transactions.ts:222-241
const transaction = await tx.transaction.create({ data: { …, accountId } }) // takes KEY SHARE on Account
await tx.account.update({ where: { id: accountId }, data: { balance: { increment: data.amount } } }) // wants NO KEY UPDATE
```

Deadlock cycle with a recalc holding (or queuing) `FOR UPDATE`:

1. Writer `T_w` inserts its `Transaction` → holds `KEY SHARE` on account A.
2. Recalc `T_r` runs `SELECT … FOR UPDATE` on A → blocks (`FOR UPDATE` conflicts with `KEY SHARE`).
3. `T_w` now runs `account.update` (`NO KEY UPDATE`) → must queue **behind** `T_r`'s pending
   `FOR UPDATE` → each waits on the other → Postgres aborts one with `40P01`.

PostgreSQL row-lock conflict matrix (relevant rows):

| Requested ↓ / Held → | KEY SHARE | NO KEY UPDATE | UPDATE |
|---|---|---|---|
| `FOR NO KEY UPDATE` | — (no conflict) | conflict | conflict |
| `FOR UPDATE` | **conflict** | conflict | conflict |

So `FOR NO KEY UPDATE` keeps the serialisation CR-6/CR-7 need (it still conflicts with balance
updates and with the cron's lock) but no longer conflicts with FK `KEY SHARE` inserts — removing
the cycle. It is also the *correct* strength: recalc/cron must serialise against balance **writes**
to the `balance` column, not against balance-neutral ledger **inserts**.

Fix — downgrade all three lock sites (`accounts.ts:611`, `accounts.ts:692`,
`loan-deferment-accrual.ts:237`):

```ts
await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${id} FOR NO KEY UPDATE`
```

Correctness under the weaker lock: concurrent balance writers use **relative** deltas
(`{ increment }` / `{ decrement }`). `FOR NO KEY UPDATE` still serialises them against recalc's
absolute overwrite (NO KEY UPDATE ↔ NO KEY UPDATE), so a writer that loses the race re-applies
its delta on top of recalc's committed sum and its inserted row is summed by the next recalc — no
lost update. The cron likewise reads its locked balance and applies a relative decrement; a
balance-neutral insert by another session can't change the figure it computed.

Scope: this one **is** introduced by the CR-6/CR-7 diffs (they added the `FOR UPDATE` locks); it
is not a pre-existing race. Severity medium — a transient deadlock aborts one transaction (no
data corruption), but `confirmRecalculateAll` locks every active account and there is no retry.

---

*CR-1 + CR-2 + CR-6 implemented (tests green: **1015 passed**, cron production file `tsc`-clean,
touched files lint clean). CR-6 closed via the `SELECT … FOR UPDATE` lock-then-compute fix —
interest is now computed from the locked live balance, so the charged amount can never derive
from a stale pre-paydown balance; this also subsumes CR-1's resurrection guard (the guarded
`updateMany` is retained as defence-in-depth). The migration
`20260618000000_loan_phased_repayment` has since been **applied** (`prisma migrate deploy`; DB
schema up to date).*

*CR-7 (a follow-up adversarial finding: `confirmRecalculate` / `confirmRecalculateAll` did a
non-transactional read-then-absolute-write the cron's `FOR UPDATE` lock could not serialise —
a **pre-existing** race, not a CR-6 regression) is now **Closed (Fixed)**: both confirm actions
wrap their read-compute-write in a `FOR UPDATE`-locked `$transaction`, the all-accounts drift
check uses the live locked balance, and the CR-6 "serialises recalculate" wording is corrected
to "*relative* writers only." Full suite **1017 passed**, app `tsc`-clean, touched files
lint-clean. All changes are uncommitted.*

*CR-8 (a third adversarial finding: the CR-6/CR-7 `SELECT … FOR UPDATE` on `Account` conflicts
with the FK `FOR KEY SHARE` lock ledger inserts take on the parent row, so a recalc or the cron
could **deadlock** a concurrent insert-then-update writer — `40P01`, no retry; unlike CR-7 this
one **was** introduced by the CR-6/CR-7 diffs) is now **Closed (Fixed)**: all three lock sites
(`accounts.ts` ×2, `loan-deferment-accrual.ts` ×1) downgraded to `FOR NO KEY UPDATE`, which keeps
the balance-writer serialisation (and the cron mutual-exclusion) without conflicting with FK
inserts. Mock suites assert the lock **mode** in the SQL; a DB-backed integration test for the
real lock cycle is left as an explicit gap (no integration harness in-repo). Full suite **1017
passed**, app + cron-production `tsc`-clean, touched files lint-clean. All changes are
uncommitted.*
