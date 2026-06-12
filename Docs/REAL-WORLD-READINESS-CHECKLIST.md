# Real World Readiness Checklist

This app is promising for controlled personal use, but it should not be treated
as production-ready for real financial reliance until the items below are
handled. The goal is not perfection. The goal is confidence that financial data
is correct, recoverable, secure, and maintainable.

## 1. Clean Quality Gates

Required before release:

- `pnpm build` must pass without TypeScript errors.
- `pnpm lint` must pass, or remaining warnings must be documented and accepted.
- `pnpm test` must pass consistently.
- CI should run build, lint, unit tests, and any integration tests on every PR.
- The app should have a clear minimum supported Node/pnpm version.

Current known blockers:

- Build currently fails in `src/app/(app)/accounts/page.tsx` because
  `getAccountTransactions` is called with the old positional argument shape.
- Lint currently reports multiple errors outside the latest logic-fix changes.

## 2. Financial Correctness

Required before trusting real balances:

- Cover the full transaction lifecycle:
  - create, edit, delete, and restore transactions
  - linked transfers
  - bill payments
  - loan payments
  - interest transactions
  - imported transactions
- Add regression tests for balance recalculation after each major workflow.
- Ensure every balance-changing action creates an auditable transaction or has a
  clear documented reason why it does not.
- Prevent accidental positive balances on liability accounts unless explicitly
  supported.
- Review all rounding rules and ensure money is rounded only at defined
  boundaries.
- Verify account balance signs are consistent:
  - assets positive
  - liabilities negative
  - payments and interest use predictable signs
- Add tests for overpayments, partial payments, zero-interest loans, and final
  payoff behavior.
- Ensure dashboards and reports exclude system-only categories consistently,
  including `Opening Balance` and `Balance Adjustment`.

## 3. Dates And Timezones

Required before recurring or due-date workflows are trusted:

- Audit every `new Date("YYYY-MM-DD")` usage for UTC/local date shifts.
- Standardize date parsing for HTML date inputs.
- Standardize storage and display semantics for:
  - recurring bill due dates
  - loan payment dates
  - BNPL payment dates
  - credit-card statement close dates
  - report date ranges
- Add tests around month-end, leap years, daylight saving transitions, and
  timezone boundaries.
- Confirm recurring monthly, quarterly, and annual bills preserve their intended
  day-of-month anchor even when clamped for shorter months.

## 4. Security And Authorization

Required before use by anyone other than the owner:

- Verify every server action scopes reads and writes by authenticated `userId`.
- Add authorization tests for all actions that accept IDs from the client.
- Review inactive/deleted account access rules.
- Ensure cross-user IDs cannot be used for:
  - accounts
  - transactions
  - recurring bills
  - bill payments
  - loans
  - APR rates
  - budgets
  - settings
- Protect destructive actions with explicit confirmation flows.
- Review session expiration, cookie security, CSRF posture, and auth redirects.
- Ensure secrets are not committed and are documented in an `.env.example`.

## 5. Data Recovery And Auditability

Required before storing important financial history:

- Provide database backup and restore instructions.
- Test backup restoration, not just backup creation.
- Add a migration strategy for production data.
- Preserve enough audit detail to explain balance changes later.
- Avoid hard deletes for financial records unless there is an intentional,
  documented purge workflow.
- Add a way to export all user data.
- Add a way to inspect system-generated transactions separately from manual
  transactions.
- Consider an activity log for destructive or high-impact actions.

## 6. Import Reliability

Required before relying on CSV/imported data:

- Add integration tests for common CSV formats.
- Test duplicate detection across imports.
- Test correction workflows after bad imports.
- Make import previews explicit about:
  - target account
  - inferred signs
  - skipped duplicates
  - mapped categories
  - date parsing
- Ensure imports cannot silently alter balances without visible transactions.

## 7. Reporting Reliability

Required before using reports for decisions:

- Add tests for report date boundaries.
- Verify income, expense, loan principal, loan interest, credit-card interest,
  transfers, opening balances, and adjustment categories are included or
  excluded intentionally.
- Document the meaning of net worth, cash flow, spending, income, and tithing
  calculations.
- Add fixture-based report tests using known transactions with expected totals.

## 8. User Experience Safeguards

Required before broad use:

- Add confirmation and preview steps for high-impact operations:
  - deleting accounts
  - recalculating balances
  - importing transactions
  - recording large payments
  - editing account balances
- Make errors actionable and specific without leaking other users' data.
- Provide empty, loading, error, and success states for primary workflows.
- Ensure mobile layouts work for transaction tables, forms, and dashboards.
- Add clear validation for invalid amounts, dates, and account choices.

## 9. Operational Readiness

Required before deployment:

- Production deployment process is documented.
- Database migrations are applied in a controlled way.
- Environment variables are documented.
- Logs are useful without exposing sensitive financial details.
- Monitoring exists for:
  - failed cron jobs
  - failed builds/deploys
  - auth errors
  - database connection problems
- Cron jobs should be idempotent or have duplicate-prevention safeguards.
- Scheduled jobs should expose clear run logs and failure summaries.

## 10. Test Coverage Targets

Minimum useful coverage before real-world use:

- Unit tests for financial calculations.
- Server action tests for ownership and validation.
- Integration tests for balance-changing workflows.
- Cron tests for recurring bills, BNPL payments, and credit-card interest.
- Import tests with realistic sample CSVs.
- E2E smoke tests for:
  - sign in
  - create account
  - add transaction
  - record bill payment
  - record loan payment
  - view dashboard/report totals
  - export or inspect data

## Suggested Release Levels

### Personal Beta

Acceptable when:

- Build passes.
- Focused finance tests pass.
- Backups exist and have been restored once.
- Known risks are documented.

### Private Production

Acceptable when:

- Build, lint, and tests pass in CI.
- Core workflows have integration tests.
- Backups, migrations, and deployment are documented.
- Authorization tests cover all ID-based actions.

### Multi-User Production

Acceptable when:

- All private-production items are complete.
- Security review is complete.
- Monitoring and alerting are in place.
- Data export and recovery flows are tested.
- Destructive actions are auditable and reversible where practical.

## Immediate Next Steps

1. Fix the current TypeScript build failure.
2. Fix lint errors or document accepted lint exceptions.
3. Add integration tests around the highest-risk money workflows.
4. Audit date parsing and timezone handling.
5. Document and test backup/restore.
6. Add authorization regression tests for every server action that accepts IDs.
