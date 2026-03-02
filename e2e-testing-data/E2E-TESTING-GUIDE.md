# PersonalLedgr — End-to-End Testing Guide

A walkthrough for a first-time user testing every feature from an empty application. No seed data is used — the tester creates all data manually and via CSV import, then verifies dashboard values, reports, and cron job effects the next day.

---

## Prerequisites

```bash
docker compose up --build
```

Open `http://localhost:3000`. The app should show the login page.

---

## Table of Contents

1. [Registration & First Login](#1-registration--first-login)
2. [Empty Dashboard & Getting Started Guide](#2-empty-dashboard--getting-started-guide)
3. [Create Accounts](#3-create-accounts)
4. [Import Transactions via CSV](#4-import-transactions-via-csv)
5. [Verify Dashboard After Import](#5-verify-dashboard-after-import)
6. [Manual Transactions](#6-manual-transactions)
7. [Transfers](#7-transfers)
8. [Verify Transfer Exclusion](#8-verify-transfer-exclusion)
9. [Set Up Recurring Bills](#9-set-up-recurring-bills)
10. [Create Budgets](#10-create-budgets)
11. [Verify Budget Tracking](#11-verify-budget-tracking)
12. [Set Up Loans](#12-set-up-loans)
13. [Verify Loan Detail Page](#13-verify-loan-detail-page)
14. [Set Up a Credit Card with APR](#14-set-up-a-credit-card-with-apr)
15. [Import Credit Card Transactions](#15-import-credit-card-transactions)
16. [Duplicate Detection on Re-Import](#16-duplicate-detection-on-re-import)
17. [Reports Verification](#17-reports-verification)
18. [Settings & Profile](#18-settings--profile)
19. [Come Back Tomorrow — Cron Job Verification](#19-come-back-tomorrow--cron-job-verification)
20. [BNPL Loan Cron Test](#20-bnpl-loan-cron-test)
21. [Payday Loan Cron Test](#21-payday-loan-cron-test)
22. [Multi-User Isolation](#22-multi-user-isolation)

---

## 1. Registration & First Login

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to `http://localhost:3000` | Redirected to `/login` page |
| 2 | Click the registration link | Registration form appears |
| 3 | Enter email: `tester@test.local`, name: `Test User`, password: `TestPass123!` | Fields accept input |
| 4 | Submit registration | Redirected to `/` (dashboard) |
| 5 | Refresh the page | Session persists — still on dashboard, not redirected to login |

### Route Protection Test

| Step | Action | Look For |
|---|---|---|
| 1 | Log out via user menu in sidebar footer | Redirected to `/login` |
| 2 | Type `/accounts` in the URL bar directly | Redirected to `/login` (blocked by proxy) |
| 3 | Log back in with `tester@test.local` / `TestPass123!` | Redirected to dashboard |

---

## 2. Empty Dashboard & Getting Started Guide

| Step | Action | Look For |
|---|---|---|
| 1 | Observe the dashboard (no accounts exist yet) | **"Welcome to PersonalLedgr"** card centered on page |
| 2 | Verify the welcome card text | "It looks like you're just getting started..." message |
| 3 | Verify two buttons on the card | "Getting Started Guide" button and "Load Demo Data" button |
| 4 | Click "Getting Started Guide" | Navigated to `/guide` |
| 5 | Verify guide page | 10 numbered step cards, each with a title, description, and link button |
| 6 | Verify sidebar | "Getting Started" link visible at the bottom of the navigation |
| 7 | Verify header | Shows "Getting Started" as the page title |
| 8 | Click "Go to Accounts" on step 3 | Navigated to `/accounts` |

### Disclaimer Modal Test

| Step | Action | Look For |
|---|---|---|
| 1 | Clear browser localStorage | Disclaimer state reset |
| 2 | Refresh page | Disclaimer modal appears |
| 3 | Click "I understand and accept" | Modal closes |
| 4 | Refresh page again | Modal does NOT reappear |

---

## 3. Create Accounts

Navigate to `/accounts`. The page should be empty. Create the following accounts one at a time using the "Add Account" button.

### 3.1 Checking Account

| Field | Value |
|---|---|
| Name | Main Checking |
| Type | Checking |
| Balance | 5000.00 |
| Owner | (leave blank) |

**After saving:** Account appears in list showing "Main Checking" with balance $5,000.00.

### 3.2 Savings Account

| Field | Value |
|---|---|
| Name | High-Yield Savings |
| Type | Savings |
| Balance | 10000.00 |
| Owner | (leave blank) |

**After saving:** Account shows $10,000.00.

### 3.3 Credit Card Account

| Field | Value |
|---|---|
| Name | Visa Rewards |
| Type | Credit Card |
| Balance | -350.00 |
| Credit Limit | 5000.00 |
| Statement Close Day | 15 |
| Payment Due Day | 10 |
| Grace Period | 25 |
| Purchase APR (%) | 21.99 |
| Owner | (leave blank) |

**After saving:** Account shows -$350.00. Credit limit $5,000.00 visible on detail page. A STANDARD APR rate of 21.99% is automatically created.

### 3.4 Verify Account List

After creating all 3 accounts, the Accounts page should show:

| Account | Type | Balance |
|---|---|---|
| Main Checking | Checking | $5,000.00 |
| High-Yield Savings | Savings | $10,000.00 |
| Visa Rewards | Credit Card | -$350.00 |

### 3.5 Verify Dashboard Updates

Navigate to `/`. The welcome card should be **gone** — normal dashboard widgets now display:

| Widget | Expected Value |
|---|---|
| Net Worth | $14,650.00 |
| Assets | $15,000.00 ($5,000 + $10,000) |
| Liabilities | $350.00 |
| Credit Utilization | Visa Rewards: $350 / $5,000 = **7.00%** |

---

## 4. Import Transactions via CSV

### 4.1 Import Checking Account — January

**File:** `e2e-testing-data/import-checking-jan.csv`

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to `/import` | Import wizard step 1 |
| 2 | Upload `import-checking-jan.csv` | Column preview shows: Date, Description, Amount, Category |
| 3 | Amount pattern should auto-detect as "Single Amount" | One Amount column mapping |
| 3b | Verify "Invert signs" checkbox is **unchecked** (checking account) | Checkbox not checked |
| 3c | Verify sign description says "Negative amounts will be treated as expenses and positive amounts as income." | Account-type-aware text (expenses/income for checking) |
| 4 | Map: Date → "Date", Description → "Description", Amount → "Amount", Category → "Category" | Preview table shows 15 rows |
| 5 | Verify negative amounts colored red (expenses) | -$85.00, -$112.47, etc. |
| 6 | Verify positive amounts colored green (income) | $3,250.00 (two paychecks) |
| 7 | Click Continue | Duplicate detection step — all 15 should show "New" (no prior data) |
| 8 | Select target account: **Main Checking** | Account selected |
| 9 | Click "Import 15 Transaction(s)" | Success message |

**Expected balance change on Main Checking:**

| Type | Transactions | Subtotal |
|---|---|---|
| Income | 2 paychecks | +$6,500.00 |
| Expenses | 13 expenses | -$1,026.11 |
| **Net** | | **+$5,473.89** |

Expense breakdown: $85.00 + $112.47 + $48.30 + $22.99 + $14.85 + $67.23 + $135.60 + $89.15 + $52.40 + $10.99 + $145.88 + $6.75 + $234.50 = **$1,026.11**

**New checking balance:** $5,000.00 + $5,473.89 = **$10,473.89**

| Verification | Look For |
|---|---|
| Main Checking balance on Accounts page | **$10,473.89** |
| Transaction count on Transactions page (filter: Main Checking) | **15 transactions** |

### 4.2 Import Checking Account — February

**File:** `e2e-testing-data/import-checking-feb.csv`

Repeat the same import process, targeting **Main Checking**.

**Expected balance change:**

| Type | Transactions | Subtotal |
|---|---|---|
| Income | 2 paychecks | +$6,500.00 |
| Expenses | 12 expenses | -$699.38 |
| **Net** | | **+$5,800.62** |

Expense breakdown: $85.00 + $78.33 + $42.15 + $22.99 + $38.90 + $55.60 + $148.20 + $96.44 + $10.99 + $12.50 + $63.28 + $45.00 = **$699.38**

**New checking balance:** $10,473.89 + $5,800.62 = **$16,274.51**

| Verification | Look For |
|---|---|
| Main Checking balance | **$16,274.51** |
| Total transactions for Main Checking | **29 transactions** |

---

## 5. Verify Dashboard After Import

Navigate to `/`. With 2 months of checking data imported:

### 5.1 Net Worth Card

| Field | Expected Value |
|---|---|
| Assets | $26,274.51 ($16,274.51 checking + $10,000 savings) |
| Liabilities | $350.00 (Visa unchanged) |
| Net Worth | **$25,924.51** |

### 5.2 Income vs Expense Chart

Should show bars/lines for January and February:

| Month | Income | Spending |
|---|---|---|
| January 2026 | $6,500.00 | $1,026.11 |
| February 2026 | $6,500.00 | $699.38 |

### 5.3 Spending Breakdown (Current Month — February)

Donut chart should show February spending categories:

| Category | Amount |
|---|---|
| Groceries | $238.05 ($78.33 + $55.60 + $96.44 + $63.28 - wait, let me recount) |
| Utilities | $233.20 ($85.00 + $148.20) |
| Dining Out | $96.40 ($38.90 + $12.50 + $45.00) |
| Groceries | $293.65 ($78.33 + $55.60 + $96.44 + $63.28) |
| Gas | $42.15 |
| Subscriptions | $33.98 ($22.99 + $10.99) |

### 5.4 Recent Transactions

Should show the 10 most recent transactions (late February entries first), sorted newest first.

---

## 6. Manual Transactions

### 6.1 Add an Expense

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to `/transactions`, click "Add Transaction" | Form dialog opens |
| 2 | Tab: Expense | Expense form shown |
| 3 | Account: Main Checking | Selected |
| 4 | Amount: 75.00 | Entered |
| 5 | Date: 2026-02-28 | Entered |
| 6 | Description: "Pharmacy" | Entered |
| 7 | Category: Healthcare | Selected from dropdown |
| 8 | Submit | Transaction created, dialog closes |
| 9 | Verify checking balance | $16,274.51 - $75.00 = **$16,199.51** |

### 6.2 Add Income

| Step | Action | Look For |
|---|---|---|
| 1 | Add Transaction > Income tab | Income form |
| 2 | Account: Main Checking, Amount: 200.00, Date: 2026-02-28, Description: "Freelance Work", Category: Freelance | Fields populated |
| 3 | Submit | Transaction created |
| 4 | Verify checking balance | $16,199.51 + $200.00 = **$16,399.51** |

---

## 7. Transfers

### 7.1 Create a Transfer

| Step | Action | Look For |
|---|---|---|
| 1 | Add Transaction > Transfer tab | Transfer wizard appears |
| 2 | Source: Main Checking | Selected |
| 3 | Destination: High-Yield Savings | Selected |
| 4 | Amount: 1000.00 | Entered |
| 5 | Date: 2026-02-28 | Entered |
| 6 | Submit | Two linked transactions created |

**Expected balances after transfer:**

| Account | Before | After |
|---|---|---|
| Main Checking | $16,399.51 | **$15,399.51** |
| High-Yield Savings | $10,000.00 | **$11,000.00** |

### 7.2 Verify Linked Transactions

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to Transactions, find the transfer in Checking | Shows -$1,000.00, type: TRANSFER |
| 2 | Look for linked transaction indicator | Badge or link to the paired transaction |
| 3 | Find the transfer in Savings | Shows +$1,000.00, type: TRANSFER |

---

## 8. Verify Transfer Exclusion

This is a critical test — transfers must NEVER count as income or expense.

| Verification Point | Look For |
|---|---|
| Dashboard > Income vs Expense chart (February) | Income still **$6,700.00** ($6,500 paychecks + $200 freelance). The $1,000 transfer is NOT included |
| Dashboard > Spending Breakdown (February) | Total spending is **$774.38** ($699.38 imported + $75 pharmacy). The $1,000 transfer is NOT included |
| Reports page (filter Feb 2026) | Same — transfer excluded from income and spending totals |

---

## 9. Set Up Recurring Bills

Navigate to `/recurring`. Page should be empty.

### 9.1 Create a Fixed Monthly Bill

| Field | Value |
|---|---|
| Name | Internet Service |
| Amount | 79.99 |
| Frequency | Monthly |
| Day of Month | 5 |
| Category | Utilities |
| Payment Account | Main Checking |
| Variable Amount | OFF |

**After saving:** Bill appears in list with next due date on the 5th of the next applicable month.

### 9.2 Create a Variable Monthly Bill

| Field | Value |
|---|---|
| Name | Electric Bill |
| Amount | 130.00 |
| Frequency | Monthly |
| Day of Month | 18 |
| Category | Utilities |
| Payment Account | Main Checking |
| Variable Amount | ON |

**After saving:** Bill shows variable indicator/badge. Amount labeled "estimated".

### 9.3 Create a Weekly Bill

| Field | Value |
|---|---|
| Name | House Cleaning |
| Amount | 50.00 |
| Frequency | Weekly |
| Start Date | 2026-03-02 (a Monday) |
| Category | Housing |
| Payment Account | Main Checking |
| Variable Amount | OFF |

**After saving:** Next due date is 2026-03-02. Subsequent dates calculated every 7 days from this anchor.

### 9.4 Verify Recurring Bills List

| Bill | Amount | Frequency | Variable | Account |
|---|---|---|---|---|
| Internet Service | $79.99 | Monthly | No | Main Checking |
| Electric Bill | $130.00 (est.) | Monthly | Yes | Main Checking |
| House Cleaning | $50.00 | Weekly | No | Main Checking |

### 9.5 Verify Upcoming Bills on Dashboard

Navigate to `/`. The Upcoming Bills widget should show bills with their next due dates and days until due.

---

## 10. Create Budgets

Navigate to `/budgets`. Select the current month (February 2026).

### 10.1 Create Budgets

Create three budgets:

| Category | Monthly Limit |
|---|---|
| Groceries | 400.00 |
| Dining Out | 150.00 |
| Utilities | 300.00 |

### 10.2 Copy Budgets to Next Month

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to March 2026 | Empty budget page |
| 2 | Click "Copy from Previous Month" | All 3 budgets copied |
| 3 | Verify limits | Groceries $400, Dining Out $150, Utilities $300 — same as Feb |

---

## 11. Verify Budget Tracking

Navigate to `/budgets`, select February 2026.

### 11.1 Expected Budget vs Actual (February)

| Category | Budget | Actual (from imported + manual) | % Used |
|---|---|---|---|
| Groceries | $400.00 | $293.65 ($78.33 + $55.60 + $96.44 + $63.28) | ~73.4% |
| Dining Out | $150.00 | $96.40 ($38.90 + $12.50 + $45.00) | ~64.3% |
| Utilities | $300.00 | $233.20 ($85.00 + $148.20) | ~77.7% |

| Verification | Look For |
|---|---|
| Each budget row | Progress bar proportionally filled |
| No budget over 100% | All bars show normal color (not red/warning) |
| Totals in summary | Total Budgeted: $850, Total Spent: ~$623.25 |

---

## 12. Set Up Loans

Navigate to `/loans`. Page should be empty.

### 12.1 Create an Auto Loan

| Field | Value |
|---|---|
| Account Name | Car Loan |
| Account Type | Loan |
| Loan Type | Auto |
| Original Balance | 20000.00 |
| Current Balance | -18000.00 |
| Interest Rate (%) | 5.49 |
| Term (months) | 60 |
| Start Date | 2025-03-01 |
| Monthly Payment | 382.00 |

**After saving:** Loan appears in list. Account "Car Loan" created with balance -$18,000.00.

### 12.2 Create a Mortgage

| Field | Value |
|---|---|
| Account Name | Home Mortgage |
| Account Type | Mortgage |
| Original Balance | 250000.00 |
| Current Balance | -245000.00 |
| Interest Rate (%) | 6.50 |
| Term (months) | 360 |
| Start Date | 2024-06-01 |
| Monthly Payment | 1580.00 |

**After saving:** Loan appears in list. Account balance -$245,000.00.

### 12.3 Verify Account Balances Updated

Navigate to `/accounts`:

| Account | Balance |
|---|---|
| Main Checking | $15,399.51 |
| High-Yield Savings | $11,000.00 |
| Visa Rewards | -$350.00 |
| Car Loan | -$18,000.00 |
| Home Mortgage | -$245,000.00 |

### 12.4 Verify Net Worth Updated

| Field | Expected |
|---|---|
| Assets | $26,399.51 ($15,399.51 + $11,000) |
| Liabilities | $263,350.00 ($350 + $18,000 + $245,000) |
| Net Worth | **-$236,950.49** |

---

## 13. Verify Loan Detail Page

### 13.1 Car Loan Amortization

Navigate to the Car Loan detail page.

**First payment split (from current balance $18,000 @ 5.49%):**

```
Monthly interest rate = 0.0549 / 12 = 0.004575
Interest = $18,000 x 0.004575 = $82.35
Principal = $382.00 - $82.35 = $299.65
Remaining = $18,000 - $299.65 = $17,700.35
```

| Look For | Value |
|---|---|
| Amortization table row 1 — Interest | ~$82.35 |
| Amortization table row 1 — Principal | ~$299.65 |
| Amortization table row 1 — Remaining | ~$17,700.35 |
| Amortization table row 2 — Interest | ~$80.98 (decreasing as balance drops) |

### 13.2 Extra Payment Calculator

| Step | Action | Look For |
|---|---|---|
| 1 | Enter extra payment: $100/month | Schedule recalculates |
| 2 | Verify payoff is faster | Fewer total months than baseline |
| 3 | Verify interest saved | Total interest paid is lower than without extra |

### 13.3 Mortgage Amortization

Navigate to Home Mortgage detail page.

**First payment split ($245,000 @ 6.50%):**

```
Monthly interest rate = 0.065 / 12 = 0.005417
Interest = $245,000 x 0.005417 = $1,327.08
Principal = $1,580.00 - $1,327.08 = $252.92
Remaining = $245,000 - $252.92 = $244,747.08
```

| Look For | Value |
|---|---|
| Row 1 — Interest | ~$1,327.08 |
| Row 1 — Principal | ~$252.92 |
| Very high interest-to-principal ratio | Interest is ~84% of payment (typical for early mortgage) |

---

## 14. Set Up a Credit Card with APR

The Visa Rewards card was created in Step 3 with a Purchase APR of 21.99%, which auto-created a STANDARD APR rate. Verify it exists before adding more rates.

### 14.1 Verify Standard APR Rate (Auto-Created)

Navigate to the Visa Rewards account detail page. Find the APR rates section.

| Verification | Expected |
|---|---|
| Rate Type | Standard |
| APR (%) | 21.99 |
| Status | Active |

**Note:** This rate was automatically created when the credit card account was created with a Purchase APR in Step 3.3. If it's missing, add it manually with Effective Date = 2025-01-01.

### 14.2 Add Intro APR Rate (Optional — for testing expiration)

| Field | Value |
|---|---|
| Rate Type | Intro |
| APR (%) | 0.00 |
| Effective Date | 2026-01-01 |
| Expiration Date | 2026-04-01 |
| Description | 0% intro on balance transfer |

This intro rate expires April 1, 2026. After that date, the APR expiration cron job will deactivate it and reassign transactions to the standard 21.99% rate.

---

## 15. Import Credit Card Transactions

**File:** `e2e-testing-data/import-credit-card-jan.csv`

This file uses the **Separate Debit/Credit columns** format.

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to `/import`, upload `import-credit-card-jan.csv` | Column preview: Transaction Date, Memo, Debit, Credit |
| 2 | Select "Separate Debit/Credit" amount pattern | Two column mappings appear (Debit + Credit) |
| 2b | Verify "Invert signs" checkbox is **checked** by default (credit card account) | Checkbox checked |
| 2c | Verify sign description says "Positive amounts will be treated as charges and negative amounts as payment." | Account-type-aware text (charges/payment for credit card) |
| 3 | Map: Date → "Transaction Date", Description → "Memo", Debit → "Debit", Credit → "Credit" | Preview shows 8 rows |
| 4 | Verify debit rows show as negative (expenses) | -$79.99, -$24.99, -$32.50, etc. |
| 5 | Verify credit row shows as positive (payment) | +$500.00 |
| 6 | All rows show as "New" | Green badges |
| 7 | Select target account: **Visa Rewards** | Account selected |
| 8 | Click "Import 8 Transaction(s)" | Success |

**Expected balance change:**

| Type | Amounts | Subtotal |
|---|---|---|
| Debits (expenses) | $79.99 + $24.99 + $32.50 + $45.67 + $28.40 + $59.99 + $10.99 | -$282.53 |
| Credits (payments) | $500.00 | +$500.00 |
| **Net** | | **+$217.47** |

**New Visa balance:** -$350.00 + $217.47 = **-$132.53**

| Verification | Look For |
|---|---|
| Visa Rewards balance | **-$132.53** |
| Credit utilization on dashboard | $132.53 / $5,000 = **2.65%** |

---

## 16. Duplicate Detection on Re-Import

**File:** `e2e-testing-data/import-duplicates-test.csv`

This file contains 2 rows that match previously imported checking transactions (same date + description + amount) and 2 brand-new rows.

| Step | Action | Look For |
|---|---|---|
| 1 | Upload `import-duplicates-test.csv`, map columns, target: Main Checking | 4 rows parsed |
| 2 | Continue to preview step | Duplicate detection runs |
| 3 | Row: "T-Mobile Wireless" 2026-01-03 -$85.00 | Status: **"Duplicate"** — auto-deselected, row semi-opaque |
| 4 | Row: "Whole Foods" 2026-01-05 -$112.47 | Status: **"Duplicate"** — auto-deselected |
| 5 | Row: "New Pharmacy Purchase" 2026-01-30 -$28.50 | Status: **"New"** — auto-selected |
| 6 | Row: "Gym Membership" 2026-01-31 -$45.00 | Status: **"New"** — auto-selected |
| 7 | Summary shows "2 of 4 selected for import" | Correct count |
| 8 | Click "Import 2 Transaction(s)" | Only the 2 new rows imported |
| 9 | Verify checking balance | $15,399.51 - $28.50 - $45.00 = **$15,326.01** |

---

## 17. Reports Verification

Navigate to `/reports`. Set date range: 2026-01-01 to 2026-02-28.

### 17.1 Summary Cards

| Card | Expected Value |
|---|---|
| Total Income | **$13,200.00** (Jan: $6,500 + Feb: $6,500 + $200 freelance) |
| Total Spending | **$1,874.99** (Jan: $1,026.11 + Feb: $699.38 + $75 pharmacy + $28.50 + $45.00) |
| Net | **$11,325.01** (income - spending, from checking only) |

**Note:** Visa card transactions also count. Add Visa expenses: $282.53. Total spending becomes **~$2,157.52**. The $500 CC payment is a TRANSFER (imported as positive/income-like on Visa) — verify how it was categorized. If imported as generic income it will count; if categorized correctly as a transfer/payment it should not.

### 17.2 Category Breakdown Table

Look for these categories with approximate totals across Jan + Feb:

| Category | Approximate Spending |
|---|---|
| Groceries | $647.61 (Jan: $347.50 + Feb: $293.65 + minor rounding) |
| Utilities | $553.79 (Jan: $220.60 + Feb: $233.20 + more) |
| Dining Out | $171.40 |
| Gas | $90.45 |
| Subscriptions | $67.96 |
| Home Improvement | $234.50 |
| Healthcare | $73.50 |
| Shopping | $67.23 |

### 17.3 Monthly Trend Chart

| Month | Income Bar (green) | Spending Bar (red) |
|---|---|---|
| January 2026 | $6,500.00 | ~$1,026.11 |
| February 2026 | $6,700.00 | ~$848.88 |

### 17.4 Custom Date Range Test

| Step | Action | Look For |
|---|---|---|
| 1 | Change range to Feb 1–Feb 28 only | Only February data shown |
| 2 | Income total | $6,700.00 |
| 3 | Spending total | Only Feb expenses |
| 4 | January data gone from chart | Single month in trend |

---

## 18. Settings & Profile

### 18.1 Tithing Settings

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to `/settings` | Settings page loads |
| 2 | Enable Tithing | Toggle turns on |
| 3 | Set percentage: 10 | Saved |
| 4 | Set category: Donations | Saved |
| 5 | Return to dashboard | **Tithing Card** appears |
| 6 | Verify January estimated | $6,500 x 10% = **$650.00** |
| 7 | Verify February estimated | $6,700 x 10% = **$670.00** |
| 8 | Verify actual (if no Donations transactions) | **$0.00** for both months |

### 18.2 Theme Toggle

| Step | Action | Look For |
|---|---|---|
| 1 | Click sun/moon icon in sidebar footer | Theme switches (light ↔ dark) |
| 2 | Refresh page | Theme preference persists |

### 18.3 Recalculate Balances

| Step | Action | Look For |
|---|---|---|
| 1 | Find "Recalculate Balances" in settings | Button visible |
| 2 | Click it | All account balances recalculated from transaction sums |
| 3 | Verify Main Checking | Should match $15,326.01 (or current expected) |
| 4 | Verify all other accounts | No drift from expected values |

### 18.4 Profile

| Step | Action | Look For |
|---|---|---|
| 1 | Navigate to `/profile` | Profile page with name, avatar |
| 2 | Change name to "QA Tester" | Name saved |
| 3 | Check sidebar user menu | Shows "QA Tester" |
| 4 | Upload an avatar image | Avatar appears in sidebar |

---

## 19. Come Back Tomorrow — Cron Job Verification

The cron container runs scheduled jobs automatically. After leaving the app running overnight, come back and verify the effects. The jobs run at these UTC times:

| Job | Schedule | What It Does |
|---|---|---|
| Credit Card Interest | Daily 00:00 UTC | Accrues daily interest on CC expenses |
| Statement Close | Daily 00:00 UTC | Updates statement balance on close day |
| APR Expiration | Daily 00:00 UTC | Deactivates expired promo APR rates |
| Savings Interest | 1st of month, 00:00 UTC | Pays interest on savings accounts |
| Recurring Bills | Daily 06:00 UTC | Generates transactions for due bills |
| BNPL Payments | Daily 07:00 UTC | Auto-pays BNPL installments |
| Payday Payments | Daily 07:00 UTC | Auto-pays payday loan on due date |

### 19.1 Credit Card Interest Accrual

**Precondition:** Visa Rewards has a 21.99% standard APR and expenses imported.

**What the cron does daily:**
For each EXPENSE on the card, it calculates:
```
daily interest = |expense amount| x (21.99 / 100 / 365) = |amount| x 0.00060247...
```

**Grace period rule:**
- If `lastStatementPaidInFull = true`: only expenses posted BEFORE the last statement close accrue interest
- If `lastStatementPaidInFull = false`: ALL expenses accrue interest

**Since we just created this card, check `lastStatementPaidInFull`** — it depends on whether a statement close has run yet (statement close day = 15th).

**What to look for each day:**
- New `InterestLog` entries (type: CHARGED) in the database — one per qualifying expense
- No visible change to the account balance until month-end

**What to look for on the last day of the month:**
- A new **INTEREST_CHARGED** transaction on Visa Rewards (negative amount)
- Visa balance increases (becomes more negative) by the monthly interest total
- Example daily interest on all Visa expenses (total ~$282.53 of expenses):
  ```
  ~$282.53 x 0.00060247 = ~$0.17/day
  ~$0.17 x 28 days in Feb = ~$4.76 monthly interest
  ```

| Verification | Where to Look | Expected |
|---|---|---|
| Daily interest logs | Account detail > Interest section (or DB) | Small CHARGED entries each day |
| Month-end transaction | Visa Rewards transactions list | INTEREST_CHARGED transaction, amount ~-$4–5 |
| Balance change | Visa balance on month-end | More negative by ~$4–5 |

### 19.2 Statement Close

**Triggers on the 15th of each month** (because Visa statement close day = 15).

**What to look for on March 15:**

| Field | Before | After |
|---|---|---|
| Last Statement Balance | Whatever was set at creation or $0 | Current Visa balance (e.g., -$132.53 + interest) |
| Last Statement Paid In Full | Check current value | `true` if total payments since last close >= previous statement balance; `false` otherwise |

**How it determines "paid in full":**
```
totalPayments = sum of all positive-amount transactions (TRANSFER, INCOME, INTEREST_EARNED)
                between previous close date and now
paidInFull = (previous statement balance == 0) OR (totalPayments >= previous statement balance)
```

The $500 payment in the Jan import counts if it falls within the statement window.

| Verification | Where to Look |
|---|---|
| Statement balance updated | Visa detail page > Credit Card Details section |
| Paid in full flag | Same section — shows Yes or No |
| Grace period effect next day | If paid in full, new purchases won't accrue interest until next statement |

### 19.3 APR Expiration

**Triggers when intro rate expiration date arrives** (set to 2026-04-01 in step 14.2).

**What to look for on April 1, 2026:**

| Before April 1 | After April 1 |
|---|---|
| Intro 0% APR shows as active | Intro APR shows as **inactive** |
| Transactions assigned to intro rate accrue $0 interest | Those transactions reassigned to standard 21.99% APR |
| | Those transactions now accrue daily interest at 21.99% |

| Verification | Where to Look |
|---|---|
| APR rates list on Visa detail | Intro rate shows inactive/expired |
| Interest logs after April 1 | Previously 0%-interest transactions now generate daily CHARGED entries |

### 19.4 Savings Interest (1st of Month)

**Precondition:** High-Yield Savings needs an active APR rate. If you didn't add one, **add one now:**

| Field | Value |
|---|---|
| Rate Type | Standard |
| APR / APY (%) | 4.50 |
| Effective Date | 2026-01-01 |
| Description | High-yield APY |

**What to look for on March 1:**

```
Monthly interest = $11,000.00 x (4.50 / 100 / 12) = $11,000 x 0.00375 = $41.25
```

| Verification | Where to Look | Expected |
|---|---|---|
| New transaction on savings | High-Yield Savings transactions | INTEREST_EARNED +$41.25 |
| Balance increase | Savings account balance | $11,000.00 + $41.25 = **$11,041.25** |
| Interest log | Account detail interest section | EARNED entry for $41.25 |
| Dashboard net worth | Net worth card | Assets increased by $41.25 |

**On April 1 (next month):**
```
Interest = $11,041.25 x 0.00375 = $41.40
New balance = $11,041.25 + $41.40 = $11,082.65
```

Interest compounds — each month's calculation uses the updated balance.

### 19.5 Recurring Bills

**What to look for when nextDueDate arrives:**

#### Fixed Bill (Internet Service, due on the 5th):

| Verification | Where to Look | Expected |
|---|---|---|
| New transaction | Main Checking transactions | EXPENSE -$79.99, description "Internet Service", category "Utilities", source "RECURRING" |
| Balance change | Main Checking balance | Decreased by $79.99 |
| Bill payment record | Recurring Bills > Payment Tracker | New payment entry for Internet Service |
| Next due date | Recurring Bills list | Advanced to the 5th of the following month |

#### Variable Bill (Electric Bill, due on the 18th):

| Verification | Where to Look | Expected |
|---|---|---|
| New transaction | Main Checking transactions | EXPENSE -$130.00 (estimated), notes contain "PENDING_CONFIRMATION" |
| Balance change | Main Checking balance | **NOT changed** (pending confirmation) |
| Next due date | Recurring Bills list | Advanced to 18th of following month |
| User action needed | Confirm actual amount | User must manually confirm/adjust the amount and approve |

#### Weekly Bill (House Cleaning, anchor March 2):

| Verification | Where to Look | Expected |
|---|---|---|
| New transaction on March 2 | Main Checking transactions | EXPENSE -$50.00 |
| Balance | Decreased by $50.00 | |
| Next due date | March 9 (7 days later) | |
| Another transaction on March 9 | Another -$50.00 | |
| Next due date after that | March 16 | |

---

## 20. BNPL Loan Cron Test

To test the BNPL auto-payment cron, create a BNPL loan:

### 20.1 Create BNPL Loan

Navigate to `/loans`, click "Add Loan":

| Field | Value |
|---|---|
| Account Name | PayPal - Winter Jacket |
| Account Type | Loan |
| Loan Type | BNPL |
| Merchant / Description | PayPal - North Face Jacket |
| Original Balance / Purchase Price | 200.00 |
| APR (%) | 0 |
| Number of Installments | 4 |
| Payment Frequency | Biweekly |
| First Payment Date | Tomorrow's date |
| Payment Account | Main Checking |

**After saving:**
- New account "PayPal - Winter Jacket" with balance -$200.00
- Installment amount auto-calculated: $200 / 4 = **$50.00**

### 20.2 Day-by-Day Expected Results

Since APR = 0%, each payment is a pure transfer (no interest split).

**Tomorrow (Payment 1):**

| Verification | Where to Look | Expected |
|---|---|---|
| New TRANSFER transaction | Main Checking | -$50.00 |
| New LOAN_PRINCIPAL transaction | PayPal - Winter Jacket | +$50.00 |
| Transactions are linked | Both show linked transaction badge | Mutual link |
| Checking balance | Decreased by $50 | Current - $50 |
| BNPL balance | -$200 + $50 = **-$150.00** | |
| Completed installments | Loan detail | **1 of 4** |
| Next payment date | Loan detail | Tomorrow + 14 days |

**14 days later (Payment 2):**

| Verification | Expected |
|---|---|
| BNPL balance | -$100.00 |
| Completed installments | 2 of 4 |
| Next payment date | +14 more days |

**28 days later (Payment 3):**

| Verification | Expected |
|---|---|
| BNPL balance | -$50.00 |
| Completed installments | 3 of 4 |

**42 days later (Payment 4 — Final):**

| Verification | Expected |
|---|---|
| BNPL balance | $0.00 |
| Completed installments | 4 of 4 |
| Account status | **Inactive** (auto-deactivated) |
| Account disappears from active list | Loan no longer shown in active loans |

---

## 21. Payday Loan Cron Test

### 21.1 Create Payday Loan

Navigate to `/loans`, click "Add Loan":

| Field | Value |
|---|---|
| Account Name | QuickCash Payday |
| Account Type | Loan |
| Loan Type | Payday |
| Amount Borrowed | 500.00 |
| Fee per $100 Borrowed | 15.00 |
| Term (days) | 14 |
| Lender Name | QuickCash |
| Payment Account | Main Checking |

**After saving:**
- Account "QuickCash Payday" with balance -$500.00
- Auto-calculated summary should show:
  - Fee: $500 x ($15 / $100) = **$75.00**
  - Total repayment: **$575.00**
  - Equivalent APR: (15/100) x (365/14) x 100 = **391.07%**
- Due date: today + 14 days

### 21.2 On Due Date (14 Days Later)

The payday loan cron fires a single balloon payment:

| Verification | Where to Look | Expected |
|---|---|---|
| TRANSFER transaction | Main Checking | **-$575.00** |
| LOAN_PRINCIPAL transaction | QuickCash Payday | **+$500.00** |
| LOAN_INTEREST transaction | QuickCash Payday | **-$75.00** (the fee) |
| Linked transactions | TRANSFER ↔ LOAN_PRINCIPAL | Mutual link |
| Checking balance | Decreased by $575.00 | |
| Payday account balance | $0.00 (paid off) | |
| Account status | **Inactive** (auto-deactivated) | |
| Interest log | Account detail | CHARGED entry for $75.00 |

**Dashboard impact:**
- The $75 fee counts as **spending** (LOAN_INTEREST type)
- The $500 principal does **NOT** count as spending
- Net worth: checking down $575, but payday loan asset up $500 = net impact -$75 on net worth

---

## 22. Multi-User Isolation

| Step | Action | Look For |
|---|---|---|
| 1 | Log out | Redirected to login |
| 2 | Register a second user: `user2@test.local` / `Pass1234!` | New account created |
| 3 | Dashboard shows empty state | Welcome card (no accounts) |
| 4 | Navigate to `/accounts` | Empty — no accounts visible |
| 5 | Navigate to `/transactions` | Empty — no transactions |
| 6 | Create an account: "User2 Checking", Checking, $500 | Account created |
| 7 | Log out, log back in as `tester@test.local` | Original test data intact |
| 8 | Verify accounts | All 5+ accounts visible, User2's account NOT visible |
| 9 | Verify checking balance | Unchanged from previous steps |

---

## Appendix A: Test Data Summary

### Accounts Created

| # | Account | Type | Initial Balance | Purpose |
|---|---|---|---|---|
| 1 | Main Checking | Checking | $5,000.00 | Primary bank account |
| 2 | High-Yield Savings | Savings | $10,000.00 | Savings with 4.5% APY |
| 3 | Visa Rewards | Credit Card | -$350.00 | CC with 21.99% APR |
| 4 | Car Loan | Loan (Auto) | -$18,000.00 | 5.49%, 60 months |
| 5 | Home Mortgage | Mortgage | -$245,000.00 | 6.50%, 360 months |
| 6 | PayPal - Winter Jacket | Loan (BNPL) | -$200.00 | 0% 4-installment |
| 7 | QuickCash Payday | Loan (Payday) | -$500.00 | $15/$100 fee, 14 days |

### CSV Files

| File | Format | Rows | Target Account |
|---|---|---|---|
| `import-checking-jan.csv` | Single signed amount | 15 | Main Checking |
| `import-checking-feb.csv` | Single signed amount | 14 | Main Checking |
| `import-credit-card-jan.csv` | Separate debit/credit | 8 | Visa Rewards |
| `import-duplicates-test.csv` | Single signed amount | 4 | Main Checking (re-import test) |

### Running Balance Tracker — Main Checking

Use this to verify the checking balance after each step:

| After Step | Balance |
|---|---|
| Account creation | $5,000.00 |
| Import Jan CSV (+$6,500 income, -$1,026.11 expenses) | $10,473.89 |
| Import Feb CSV (+$6,500 income, -$699.38 expenses) | $16,274.51 |
| Manual expense -$75.00 | $16,199.51 |
| Manual income +$200.00 | $16,399.51 |
| Transfer -$1,000 to savings | $15,399.51 |
| Import duplicates test (-$28.50, -$45.00 new only) | $15,326.01 |
| Internet bill cron -$79.99 | $15,246.02 |
| House cleaning cron -$50.00 | $15,196.02 |
| BNPL payment 1 -$50.00 | $15,146.02 |
| Payday payoff -$575.00 | $14,571.02 |

### Cron Job Checklist

Print this and check off each item as you verify:

- [ ] **CC Interest** — Daily InterestLog entries on Visa Rewards
- [ ] **CC Interest** — Month-end INTEREST_CHARGED transaction posted
- [ ] **Statement Close** — Visa lastStatementBalance updated on the 15th
- [ ] **Statement Close** — lastStatementPaidInFull correctly determined
- [ ] **APR Expiration** — Intro rate deactivated on April 1 (if created)
- [ ] **Savings Interest** — INTEREST_EARNED transaction on 1st of month
- [ ] **Savings Interest** — Balance increased by correct amount
- [ ] **Recurring Fixed** — Internet Service EXPENSE created on the 5th
- [ ] **Recurring Fixed** — Checking balance decreased by $79.99
- [ ] **Recurring Variable** — Electric Bill EXPENSE created on the 18th with PENDING_CONFIRMATION
- [ ] **Recurring Variable** — Checking balance NOT changed (pending)
- [ ] **Recurring Weekly** — House Cleaning EXPENSE every 7 days from anchor
- [ ] **BNPL** — $50 installment every 14 days
- [ ] **BNPL** — Account deactivated after 4th payment
- [ ] **Payday** — $575 balloon payment on due date
- [ ] **Payday** — Account deactivated after payment
