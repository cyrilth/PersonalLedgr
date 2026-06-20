# Codex Adversarial Review — Findings Tracker

Tracks findings raised by `/codex:adversarial-review` against the **phased student-loan
repayment** change (deferment → interest-only → full repayment).

**Scope:** working-tree diff. Migration `20260618000000_loan_phased_repayment` has been
**applied** (`prisma migrate deploy`).

**Status legend:** `Open` · `In Progress` · `Closed (Fixed)` · `False Positive` · `Won't Fix`

| ID | Codex Review Finding | Status | Claude Comment | Next Steps |
|----|----------------------|--------|----------------|------------|
| CR-1 | **[high]** Concurrent payoff overwritten by deferment accrual (`loan-deferment-accrual.ts`). Idempotency was claimed on the `Loan` row only; the later unconditional `account.update` `decrement` lets a payment that zeroes the balance between claim and debit resurrect a paid-off loan to `-interest`. | Closed (Fixed) | Valid — the debit re-checked nothing on the live balance. | Debit replaced with a balance-guarded `account.updateMany({ where: { …, balance: { lt: 0 } } })` before the charge; `count !== 1` throws `ConcurrentPayoffError` → txn rolls back, caught as benign SKIP. Test: *rolls back when paid off mid-run*. Superseded by CR-6's lock; kept as defence-in-depth. |
| CR-2 | **[high]** Deferment accrual ignores in-window payments: `recordLoanPayment` allowed a payment dated inside deferment, double-capitalizing that interest and skewing catch-up. | Closed (Fixed) | Valid, agreed. | `recordLoanPayment` rejects a payment in calendar months `[0, defermentMonths)` from `startDate` ("no payment due until <month year>"); guarded on `defermentMonths > 0`. Tests: in-window reject, first post-window allowed, pre-start not blocked. |
| CR-3 | Future-start loans accrued phantom pre-origination interest (negative `lastIdx` inflated catch-up). | Closed (Fixed) | Self-inflicted regression from an earlier baseline fix, caught by review. | Baseline `lastDefermentAccrual = max(now, startDate)` at create; cron clamps `lastIdx = Math.max(0, …)`. Covered by `defermentMonthsToAccrue` boundary tests. |
| CR-4 | Cron used day-aware month math while the UI used calendar-month indexing — inconsistent windows. | Closed (Fixed) | Valid. User chose Option B → uniform calendar-month indexing. | Cron reverted to `monthsElapsed`; whole system is calendar-month-indexed end to end. |
| CR-5 | "Clearing deferment/interest-only fields on edit sends `undefined`, so blanking never persists." (Raised twice.) | False Positive | Not a bug — the cited lines are the **create** branch; the edit branch (`loan-form.tsx`) sends `null`, which `updateLoan` writes. Blanking on edit persists. | None. Documented to avoid re-litigating. |
| CR-6 | **[high]** Partial payoff still charged interest from the pre-payment balance. CR-1's `balance < 0` guard checks the **sign**, not the **magnitude**: interest came from the `findUnique` snapshot while the debit hit the live balance, so a near-full concurrent paydown gets a large stale charge. | Closed (Fixed) | Valid — known gap reopened from CR-1's accepted trade-off, not a regression. Low probability (monthly cron racing a balance write) but materially wrong when it hits. | After the month claim, lock the account row and compute `totalInterest` from that locked `liveBalance`; `>= 0` throws `ConcurrentPayoffError`. Computed/debited/charged all use the one locked value → closes CR-1 + CR-6. CR-1 guard kept as defence-in-depth. Tests: partial paydown ($50 not $150), full-payoff abort, lock SQL asserted. |
| CR-7 | **[high]** Recalculate can clobber a just-capitalized charge. `confirmRecalculate` did `aggregate` (read) then absolute `account.update` (write) as two **non-transactional** calls; a row lock serialises only *relative* writers, not an absolute overwrite whose read happened before the lock — so the cron's committed `INTEREST_CHARGED` is dropped from the balance. Same in `confirmRecalculateAll`. | Closed (Fixed) | Valid — **pre-existing** race, not introduced by CR-6. My CR-6 note overclaimed that the lock "serialises recalculate"; corrected to *relative* writers only. | Both confirm actions wrap read-compute-write in a `$transaction` that locks the row first, then aggregates + overwrites. `confirmRecalculateAll` drift check uses the live locked balance. Read-only reports unchanged. Tests: lock-before-aggregate order; drift from live not snapshot. |
| CR-8 | **[medium]** The CR-6/CR-7 `SELECT … FOR UPDATE` on `Account` conflicts with the FK `FOR KEY SHARE` a `Transaction` insert takes on its parent row. Writers insert-then-update (`createTransaction`), so a recalc/cron can **deadlock** a concurrent writer (`40P01`, no retry). Use `FOR NO KEY UPDATE`. | Closed (Fixed) | Valid — introduced by the CR-6/CR-7 diffs (the cron shares it). `FOR NO KEY UPDATE` still conflicts with balance updates + `FOR UPDATE` (serialisation preserved) but not with FK `KEY SHARE` (deadlock gone); it is the correct strength — serialise against balance **writes**, not balance-neutral **inserts**. | All three lock sites (`accounts.ts` ×2, `loan-deferment-accrual.ts` ×1) downgraded to `FOR NO KEY UPDATE`; comments/JSDoc + `/FOR NO KEY UPDATE/i` assertions updated. Correct under the weaker lock because concurrent writers use relative deltas. Gap: mock suites assert lock *mode* only — a real lock-cycle test needs a DB harness the repo lacks. |
| CR-9 | **[high]** Deferred-loan edits silently ignore start-date changes (`accounts.ts:547`). When an existing loan is saved with `defermentMonths > 0`, `updateAccount`'s upsert `update` branch spreads `{}` instead of writing `startDate`, while the account form (`account-form.tsx:505`) still renders an **editable** Start Date and submits it. The user gets a success toast yet the DB keeps the old date; since `startDate` anchors the deferment window + accrual, a stale date skews the phase/interest. | Closed (Fixed) | **Valid — self-inflicted.** The deliberate trade-off from this session's parity fix that stopped `updateAccount` moving `startDate` on a deferred loan (to avoid desyncing `lastDefermentAccrual` vs. the cron's calendar-month window — see CR-3/CR-4). The desync fix was correct; the defect was that the drop was **silent**. Resolved via **Option A (honest immutability)**, gated by GO check that delete + re-create preserves liability (all net-worth/liability queries filter `isActive: true`; `deleteAccount` soft-deletes; the cron filters `isActive: true`; a re-created loan gets a negative balance + Opening Balance txn). | **Closed.** (A) `updateAccount` now **rejects** a changed `startDate` on a loan whose submitted `defermentMonths > 0` (compares submitted vs. stored date-only string) instead of silently dropping it; the upsert `update` branch writes `startDate` unconditionally (validation guarantees it's unchanged for deferred loans). (B) Both forms disable the Start Date input + show a "locked — delete & re-add to change" hint while `isEdit && defermentMonths > 0`; keyed on the **live** value, so clearing deferment re-enables it (safe escape hatch). Regression tests added: rejects a deferred start-date change; allows non-date edits when the date is unchanged. Full suite **1019 passed**, `tsc`/build/lint clean. Out of scope (pre-existing, low-risk): `updateLoan`/`loan-form` ignore `startDate` for **non-deferred** loans too — tracked as CR-10. |
| CR-10 | **[low · pre-existing]** `loan-form.tsx` renders an editable Start Date for **non-deferred** loans, but `updateLoan`'s `loanUpdate` builder omits `startDate` (and the loan-form edit submit never even sent it), so the edit silently does nothing. Same "ignored edit" class as CR-9, but **no integrity risk** — since `startDate` is never written there is no watermark to desync. | Closed (Fixed) | Not introduced by this change; surfaced while closing CR-9. Resolved via **Option A (full parity with `updateAccount`)** so both write paths behave identically: non-deferred loans persist a start-date edit; deferred loans are locked (UI) and rejected (server). | **Closed.** `updateLoan` gained `startDate?: string`; the loan-form edit submit now sends it. `updateLoan` rejects a changed `startDate` when the **effective** deferment (submitted value, else stored — so a partial update can't slip a change past the guard) is `> 0`, and otherwise writes it (deferment cron filters non-deferred loans, so no desync). UI lock for deferred loans was already in place from CR-9. Tests added: non-deferred start-date edit persists; deferred change rejected; deferred non-date edit allowed when the date is unchanged. Full suite **1022 passed**, `tsc`/build/lint clean. |
| CR-11 | **[high — claimed]** Enabling deferment on an existing account leaves a stale/null accrual watermark (`accounts.ts:554-568`). `updateAccount`'s upsert `update` branch writes new `defermentMonths`/`interestOnlyMonths`/`subsidized` but **not** `lastDefermentAccrual`, so a non-deferred loan edited to `defermentMonths > 0` keeps `lastDefermentAccrual = null`. Codex inferred the cron then accrues **catch-up interest from the loan start date**, producing duplicate/phantom capitalized interest. | False Positive | **Code observation accurate; inferred impact contradicted by the cron.** `defermentMonthsToAccrue` (`loan-deferment-accrual.ts:117-118`) on a **null** watermark returns **`nowIdx <= windowEndIdx ? 1 : 0`** — at most the *current* in-window month, and **0** once the deferment window has elapsed. It never catches up from `startDate`; the catch-up branch (line 123-124) runs **only for a non-null** watermark. So there is no phantom/duplicate interest. This is the documented null-watermark semantics — *"elapsed deferment is already in the entered balance; catching it up would double-count"* — and is **identical to the canonical `updateLoan` path** (which also leaves the watermark untouched on edit), so it is not introduced by this change. The edit-mode deferment hint already tells the user the balance must include accrued interest. | None required (claimed defect does not occur). **Optional, non-blocking** consistency tweak: baseline `lastDefermentAccrual = max(now, startDate)` when an edit transitions `0 → >0` deferment, to mirror the create path — but the divergence is at most a **one-month timing shift**, not a correctness defect. The null-watermark boundary behavior (≤1 month; 0 past window) is already unit-tested in the cron suite (`defermentMonthsToAccrue` cases). |
| CR-12 | **[high — claimed]** Start-date edits can invalidate existing loan payment history (`loans.ts:518`). CR-10's `updateLoan` writes `startDate` for a non-deferred loan without checking for existing payments/transactions recorded under the old schedule; reviewer infers historical payments could "fall before origination" or "shift due-period attribution" with "no rollback/migration/reconciliation." Verdict: no-ship. | False Positive | **Code observation accurate; "no-ship" integrity claim contradicted by the code.** (1) **Nothing derived from `startDate` is persisted** — the `Loan`/`Transaction` schemas store no period index, installment number, or due-date snapshot, so there is no record to "invalidate" and nothing to reconcile. (2) **No stored financial data changes** — account balance is the sum of `Transaction.amount` (independent of `startDate`); amounts, dates, and interest logs are immutable. (3) **No crash on pre-origination payments** — `calendar.ts` returns `null`/not-due on a negative `monthsSinceStart`; `payment-tracker-grid.tsx loanPhaseForMonth` maps a negative index to a cosmetic "deferment" label; `recordLoanPayment` (`loan-payments.ts`) uses `startDate` **only** for the `defermentMonths > 0` window and a negative index bypasses it (allowed — there is a test asserting "a pre-origination date is a negative index … left to the normal flow"). (4) The only integrity-relevant `startDate` use — the deferment cron — is **already rejected** for deferred loans (CR-9/CR-10). (5) **Pre-existing:** `updateAccount` has always written `startDate` for non-deferred loans; CR-10 only reached parity — no new risk class. Residual is **cosmetic** (amortization month labels shift; tracker cells re-attribute), which is the *intended* effect of correcting a typo'd date. | None required (claimed no-ship defect does not occur — no stored data is invalidated, nothing to reconcile, no crash). **Optional, non-blocking UX:** show a hint when editing a loan's start date that it re-projects how past payments are labeled in the amortization table / tracker. Not a correctness fix. |

---

## Detail / rationale

### CR-1 — guard the debit on the live balance

Idempotency was claimed on the `Loan` row only, so the unconditional `account.update`
`decrement` re-read a balance a concurrent payment may have zeroed. The guarded
`updateMany ({ balance: { lt: 0 } })` re-checks the live balance under the row lock and aborts
(`count !== 1`) instead of resurrecting a paid-off loan.

### CR-2 — reject payments inside deferment

`recordLoanPayment` refuses a payment dated in `[0, defermentMonths)` from `startDate`,
matching the grid's "not due" — removing the double-capitalization at the source rather than
reconciling after the fact.

### CR-6 — lock, then compute

Interest is computed from a row-locked `liveBalance`, not the `findUnique` snapshot, so the
computed, debited, and charged figures are identical. A non-negative locked balance aborts —
which also subsumes CR-1's full-payoff case.

### CR-7 — recalc must be a locked read-compute-write

`confirmRecalculate*` were non-transactional read-then-absolute-write. A row lock serialises
*relative* writers (Postgres re-evaluates `balance = balance ± x` under the lock) but **not** an
absolute overwrite whose value was read before the lock. Fix: aggregate + overwrite inside one
locked `$transaction`. (This corrects the CR-6 note's "serialises recalculate" overclaim →
*relative* writers only.)

### CR-8 — `FOR NO KEY UPDATE`, not `FOR UPDATE`

A `Transaction` insert takes `FOR KEY SHARE` on its parent `Account` (FK). `FOR UPDATE`
conflicts with that, so a recalc/cron could deadlock an insert-then-update writer (`40P01`).
`FOR NO KEY UPDATE` keeps the needed serialisation without the FK conflict:

| Requested ↓ / Held → | KEY SHARE | NO KEY UPDATE | UPDATE |
|---|---|---|---|
| `FOR NO KEY UPDATE` | — | conflict | conflict |
| `FOR UPDATE` | **conflict** | conflict | conflict |

Correctness under the weaker lock: concurrent balance writers use relative deltas, which
`FOR NO KEY UPDATE` still serialises against recalc's absolute overwrite — a writer that loses
the race re-applies its delta on top of the committed sum and its row is summed by the next
recalc; no lost update.

### CR-9 — silent start-date drop on deferred-loan edits *(Closed — Option A)*

This session added phased-repayment fields to the **Add/Edit Account** dialog for parity with the
dedicated loan form. An earlier in-session review flagged that `updateAccount` overwrote
`startDate` while leaving `lastDefermentAccrual` pinned — moving the cron's window anchor out from
under a fixed watermark, which would re-capitalize or skip already-accrued deferment months. The
first fix gated the write to a silent `{}` spread, which stopped the desync but left the **form
unchanged**: an editable Start Date that, for a deferred loan, showed "Account updated" while the
value never persisted — a silent integrity gap, exactly the failure mode Codex challenged.

**Resolution — Option A (honest immutability).** Chosen after confirming the GO condition that a
user can correct the date by **deleting and re-adding** the loan without losing liability accuracy:
all net-worth/liability queries filter `account.isActive: true`, `deleteAccount` soft-deletes, the
deferment cron filters `isActive: true`, and a re-created loan gets a negative balance + Opening
Balance txn. So the old (wrong) loan drops out of every total and the new one is correct from day one.

Server (`updateAccount`) — reject, don't drop:

```ts
// existing loan now fetched with { startDate, defermentMonths }
if (data.loan && (data.loan.defermentMonths ?? 0) > 0 && existing.loan) {
  const storedStart = existing.loan.startDate.toISOString().slice(0, 10)
  if (data.loan.startDate !== storedStart) {
    throw new Error("A loan with deferment can't have its start date changed … delete this loan and add it again.")
  }
}
// upsert `update` branch now writes startDate unconditionally — the guard above
// guarantees it is unchanged for a deferred loan; non-deferred loans correct freely.
```

UI (both `account-form.tsx` and `loan-form.tsx`) — the Start Date input is `disabled` with a
"locked — delete & re-add to change" hint while `isEdit && parseInt(defermentMonths) > 0`. The gate
reads the **live** field value, so clearing deferment re-enables the date (a safe escape hatch: a
non-deferred loan has nothing to desync). The check keys on the **submitted** `defermentMonths`, so
removing deferment and editing the date in one save is allowed; the UI and server agree.

Regression tests (`accounts.test.ts`): a deferred start-date change throws and skips the upsert; a
non-date edit with the date unchanged still upserts. The canonical `loan-form`/`updateLoan` path is
already safe (it never writes `startDate`, so no desync) — its remaining non-deferred cosmetic
silent-drop is tracked separately as **CR-10**.

### CR-10 — make the loan form's start-date edit honest *(Closed — Option A)*

Closing CR-9 surfaced that the **dedicated loan form** had the same "editable field that does
nothing" shape for *non-deferred* loans: `updateLoan` never wrote `startDate` (it wasn't in the
param type, and the loan-form edit submit didn't even send it), so correcting a non-deferred loan's
origination date silently no-op'd. No integrity risk — nothing is written, so there is no watermark
to desync — but it left the account and loan forms inconsistent (the account form *did* persist the
edit after CR-9). Resolved with **Option A — full parity**, mirroring `updateAccount`:

```ts
// updateLoan — reject a deferred start-date change; otherwise persist it.
const effectiveDeferment =
  data.defermentMonths !== undefined ? (data.defermentMonths ?? 0) : (account.loan.defermentMonths ?? 0)
if (data.startDate !== undefined && effectiveDeferment > 0) {
  const storedStart = account.loan.startDate.toISOString().slice(0, 10)
  if (data.startDate !== storedStart) throw new Error("A loan with deferment can't have its start date changed … delete this loan and add it again.")
}
// builder: if (data.startDate !== undefined) loanUpdate.startDate = new Date(data.startDate)
```

The guard keys on the **effective** deferment (submitted value, else stored) rather than only the
submitted one, so a partial `updateLoan` call that omits `defermentMonths` can't slip a start-date
change past it on an already-deferred loan — a subtlety the account path didn't need (its form
always submits the full `loan` object). The deferred-loan UI lock came for free from CR-9. End state:

| | Non-deferred loan | Deferred loan |
|---|---|---|
| Account form | edit persists | locked + server rejects |
| Loan form | edit persists | locked + server rejects |

Tests (`loans.test.ts`): non-deferred start-date edit persists; deferred change rejected; deferred
non-date edit allowed when the date is unchanged.

### CR-11 — "enabling deferment leaves a null watermark → phantom catch-up" *(False Positive)*

Codex flagged that `updateAccount`'s upsert `update` branch writes `defermentMonths` but not
`lastDefermentAccrual`, so editing a non-deferred loan to `defermentMonths > 0` leaves the watermark
`null`, and inferred the cron would then **catch up interest from `startDate`**, double-capitalizing.

The code observation is correct; the inferred impact is the opposite of what the cron does. The
null-watermark branch is explicitly capped at the current month:

```ts
// loan-deferment-accrual.ts — defermentMonthsToAccrue
const nowIdx = monthsElapsed(start, now)
if (lastAccrual === null) {
  return nowIdx >= 0 && nowIdx <= windowEndIdx ? 1 : 0   // ≤ 1 month; 0 once the window has elapsed
}
// catch-up from the watermark only runs when lastAccrual !== null:
const lastIdx = Math.max(0, monthsElapsed(start, lastAccrual))
return Math.max(0, Math.min(nowIdx, windowEndIdx) - lastIdx)
```

So a `null` watermark accrues **at most one month** (the current one) and **0** if the deferment
window already ended — never a multi-month catch-up from `startDate`. The first run then stamps the
watermark, and subsequent months proceed normally. This is the intended *"the entered balance
already includes elapsed deferment; catching it up would double-count"* semantics, and it is the
**same behavior as the canonical `updateLoan`** (which likewise leaves the watermark untouched on
edit) — so it is neither new nor unique to the account form. The edit-mode hint shown whenever
`defermentMonths > 0` already tells the user the balance must include any already-accrued interest.

Net: no phantom or duplicate interest; the claimed failure mode cannot occur. A purely optional
consistency improvement would be to baseline the watermark on a `0 → >0` deferment edit (mirroring
create), but the only difference today is a one-month timing shift — not a correctness issue — so
it is logged as a non-blocking note, not a fix.

### CR-12 — "start-date edits invalidate payment history" *(False Positive)*

CR-10 made `updateLoan` persist a `startDate` edit for non-deferred loans (matching `updateAccount`).
Codex challenged this as a no-ship: moving the anchor under already-recorded payments could "invalidate
payment history" or "shift due-period attribution" with no reconciliation. Investigated end-to-end;
the integrity claim does not hold, because **`startDate` is a recomputed projection anchor, not a
persisted key**:

- **No derived persistence.** `prisma/schema.prisma` — neither `Loan` nor `Transaction` stores any
  `startDate`-derived value (no period index, installment number, or due-date snapshot). There is
  literally no stored field for a start-date move to invalidate, hence nothing to reconcile or migrate.
- **Balance is independent.** Account balance is the sum of `Transaction.amount`; `updateLoan` writing
  `startDate` changes no balance, amount, date, or interest log. All actual financial records are immutable.
- **Negative indices are handled, not crashed.** Every `startDate` consumer tolerates a payment dated
  before origination: `calendar.ts getDueDay` returns `null` (not due) for `monthsSinceStart < 0`;
  `payment-tracker-grid.tsx loanPhaseForMonth` maps a negative index to a (cosmetic) "deferment" phase;
  `recordLoanPayment` uses `startDate` **only** inside the `defermentMonths > 0` window check and a
  negative index bypasses it — there is an explicit test: *"a pre-origination date is a negative index
  and is left to the normal flow, not the deferment rejection."*
- **The integrity-critical case is already blocked.** The one place a stale `startDate` *does* matter —
  the deferment-accrual cron's window watermark — only applies to deferred loans, and CR-9/CR-10 already
  **reject** a start-date change there. Non-deferred loans (the only ones that persist the edit) are
  outside the cron's `defermentMonths > 0` filter entirely.
- **Pre-existing, not introduced.** `updateAccount` has written `startDate` for non-deferred loans since
  before this work; CR-10 only brought `updateLoan` to parity, so it added no new exposure.

The genuine residual is **cosmetic**: a corrected start date re-labels the amortization table's months
and may re-attribute (or grey out) tracker cells for payments that now fall outside the shifted window —
recomputed on the fly, and precisely the *intended* effect of fixing a wrong origination date. No stored
data is touched. An **optional, non-blocking** UX nicety would be a hint that editing the start date
re-projects past-payment labels; it is not a correctness fix and was not implemented.

---

*All twelve findings dispositioned: **CR-1–CR-4, CR-6–CR-10 fixed**; **CR-5, CR-11, and CR-12 false
positives** (CR-11's claimed null-watermark catch-up is contradicted by the cron, which caps a null
watermark at one month and matches the canonical `updateLoan` path; CR-12's claimed payment-history
corruption from a start-date edit cannot occur — `startDate` is a recomputed projection anchor with no
derived persistence, balances are transaction-sums, negative indices are handled, and the only
integrity-relevant use, the deferment cron, already rejects start-date changes on deferred loans).
Start-date editing now behaves
identically across **both** forms (CR-9 + CR-10, Option A): a non-deferred loan persists the edit; a
deferred loan is locked in the UI and **rejected** by the server (no longer a silent drop), with
delete-&-re-add guidance — validated by the GO check that re-creating a loan preserves liability
accuracy (all net-worth queries filter `isActive: true`; `deleteAccount` soft-deletes; the cron
filters `isActive: true`; a re-created loan gets a negative balance + Opening Balance txn). The
deferment cron and the recalc actions serialise on the `Account` row with `FOR NO KEY UPDATE`:
interest is computed from the locked live balance (CR-6), recalc is a locked read-compute-write
(CR-7), and the lock mode avoids the FK `KEY SHARE` deadlock (CR-8). Migration
`20260618000000_loan_phased_repayment` applied. Full suite **1022 passed**, app + cron-production
`tsc`-clean, build clean, touched files lint-clean. Known gap: no DB-backed integration test for the
real lock cycle (no harness in-repo). All changes uncommitted.*
