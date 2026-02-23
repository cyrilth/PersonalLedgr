---
name: do-task
description: Implement a task from TASKS.md by its ID (e.g., 2.3b, 3.1, 4.2). Reads the task requirements, implements the code, writes unit tests, and runs Playwright UI tests.
disable-model-invocation: true
argument-hint: [task-id e.g. 2.3b]
---

# Task Implementation Skill

You are implementing task **$ARGUMENTS** from the project task list.

## Step 1: Read and Understand the Task

1. Read `Docs/TASKS.md` and locate the section for task **$ARGUMENTS** (e.g., "### 2.3b" or "### 3.1").
2. Extract ALL requirements — every checkbox item is a deliverable.
3. If the task has a companion test section (e.g., task 2.3 has 2.3b for tests), note those test requirements too.
4. Read `CLAUDE.md` for project conventions, architecture principles, and tech stack details.
5. Read any existing files that will be modified or that the task depends on.

## Step 2: Plan the Implementation

Before writing any code, create a clear plan:
- Identify which files need to be created or modified.
- Determine the correct subagents to use based on what the task involves:
  - **db-migrate**: If the task requires schema changes or migrations
  - **seed-manager**: If the task requires seed data changes
  - **component-builder**: If the task involves React components, pages, or UI work
  - **cron-builder**: If the task involves scheduled jobs
  - **docker-dev**: If the task involves Docker/infrastructure changes
- List dependencies between steps (what must happen first).

## Step 3: Implement the Task

Execute the implementation using the appropriate subagents:

### Documentation & Commenting Standards

All code written MUST follow these documentation standards:

**File-level documentation:**
- Every new file must start with a JSDoc block comment explaining the file's purpose, key patterns, and any non-obvious design decisions.
- Example: see `src/actions/accounts.ts` for the canonical pattern — it documents the module's role, key patterns (Decimal → toNumber, negative balances, soft delete), and scoping rules.

**Function-level documentation:**
- Every exported function must have a JSDoc comment (`/** ... */`) explaining:
  - What the function does (one-line summary)
  - Key behavior details (e.g., "Uses Prisma transaction for atomicity", "Returns only active accounts")
  - What it throws and when (e.g., "Throws if the account doesn't exist or doesn't belong to the current user")
  - Non-obvious return value details if the shape isn't self-evident
- Internal helper functions should have a brief JSDoc comment explaining their purpose.

**Inline comments:**
- Add comments for non-obvious logic — e.g., why a filter exists, why a specific query shape was chosen, or tricky edge cases.
- Use `// ── Section Name ──` separator comments to organize files into logical sections (Helpers, Types, Server Actions, etc.) following the existing codebase pattern.
- Do NOT add obvious comments like `// return the result` or `// increment counter`.

**Test file documentation:**
- Test files should have section separator comments grouping tests by the function under test (e.g., `// ── getLoans ──`).
- Complex test setups or non-obvious mock configurations should have a brief comment explaining why.

### For Server Actions / Backend Logic:
- Write the server actions in `src/actions/`.
- Follow existing patterns (check nearby action files for conventions).
- Always scope queries by `userId` from the authenticated session.
- Use Prisma transactions for atomic operations.

### For UI Components:
- Use the **component-builder** subagent for React components.
- Follow shadcn/ui patterns with Tailwind CSS 4.
- Use the emerald green color scheme and semantic finance colors from CLAUDE.md.
- Components go in `src/components/<feature>/`.
- Pages go in `src/app/(app)/<route>/`.

### For Database Changes:
- Use the **db-migrate** subagent for any Prisma schema modifications.
- Always run `pnpm exec prisma generate` after schema changes.

### For Cron Jobs:
- Use the **cron-builder** subagent for scheduled task work.

## Step 4: Write Unit Tests

Use the **test-agent** subagent to create comprehensive unit tests:

- Test files go in `src/actions/__tests__/<feature>.test.ts` for server actions.
- Test files go in `src/components/__tests__/<feature>.test.tsx` for components (if jsdom environment is set up).
- Follow the existing test patterns:
  - Mock `next/headers`, `@/lib/auth`, and `@/db` using `vi.mock()`.
  - Use `vitest` (not Jest) — the project uses `vitest` with `pnpm test`.
  - Test all success paths, error paths, validation, and edge cases.
  - Cover every test requirement listed in the task's test section (e.g., section X.Xb).
- Run `pnpm test` to verify all tests pass.
- If any tests fail, fix them before proceeding.

## Step 5: Run Playwright UI Tests

After implementation and unit tests pass:

1. Ensure the app is running (check if `http://localhost:3000` is accessible).
2. Use the Playwright MCP tools to perform end-to-end UI verification:
   - Navigate to the relevant page(s) for the task.
   - Log in using demo credentials: **demo@personalledgr.local** / **testpassword123**
   - Verify the UI renders correctly:
     - Take snapshots (`browser_snapshot`) to check page structure.
     - Verify key elements are present and interactive.
     - Test user interactions (clicks, form submissions, navigation).
   - For data-displaying pages: verify data appears correctly.
   - For form pages: test form submission and validation.
   - For pages with charts/visualizations: verify chart containers render.
   - Take a screenshot (`browser_take_screenshot`) as final visual confirmation.
3. If any UI issues are found, fix them and re-test.

## Step 6: Final Verification

1. Run `pnpm test` one final time to confirm all unit tests pass.
2. Run `pnpm build` to verify no TypeScript or build errors (if applicable).
3. Summarize what was implemented, what tests were written, and the Playwright UI test results.
4. List any remaining unchecked items from the task that were intentionally deferred (with reasons).

## Important Rules

- **Never commit** without explicit user approval.
- Follow the transaction type system from CLAUDE.md — transfers are NEVER income or expense.
- Use `pnpm` for all commands (not npm/npx).
- Keep solutions focused — don't over-engineer or add features beyond what the task specifies.
- If a task item is marked `[x]` in TASKS.md, it's already done — skip it.
- Only implement items marked `[ ]` (unchecked).
