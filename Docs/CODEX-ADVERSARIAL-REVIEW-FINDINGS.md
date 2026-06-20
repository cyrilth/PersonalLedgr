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

---

*All eight findings resolved (CR-5 a documented false positive). The deferment cron and the
recalc actions serialise on the `Account` row with `FOR NO KEY UPDATE`: interest is computed
from the locked live balance (CR-6), recalc is a locked read-compute-write (CR-7), and the lock
mode avoids the FK `KEY SHARE` deadlock (CR-8). Migration `20260618000000_loan_phased_repayment`
applied. Full suite **1017 passed**, app + cron-production `tsc`-clean, touched files lint-clean.
Known gap: no DB-backed integration test for the real lock cycle (no harness in-repo). All
changes uncommitted.*
