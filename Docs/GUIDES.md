# PersonalLedgr User Guide

## Getting Started

### First Login

1. Open PersonalLedgr in your browser (default: http://localhost:3000).
2. Click **Register** and create an account with your email and password.
3. After registration you are logged in automatically and taken to the dashboard.

### Creating Accounts

1. Navigate to **Accounts** in the sidebar.
2. Click **Add Account**.
3. Choose an account type:
   - **Checking** -- everyday spending account
   - **Savings** -- interest-bearing savings account
   - **Credit Card** -- tracks balances as debt with interest accrual
   - **Loan** -- auto, student, or personal loans
   - **Mortgage** -- home loans with amortization tracking
4. Enter the account name, current balance, and any optional details (institution, account number, owner).
5. Click **Save**.

For loan and mortgage accounts, you will also be prompted to enter the original principal, interest rate, term, and start date so the system can generate an amortization schedule.

---

## Adding Custom Transaction Categories

PersonalLedgr ships with a set of default categories:

Housing, Utilities, Groceries, Dining Out, Transportation, Gas, Insurance, Healthcare, Personal Care, Clothing, Entertainment, Subscriptions, Education, Childcare, Pets, Gifts, Donations, Travel, Home Improvement, Electronics, Salary, Freelance, Investment Income, Refund, Transfer, Loan Payment, Credit Card Payment, Other.

To add your own:

1. Go to **Settings** > **Categories**.
2. Type the name of your new category and click **Add**.
3. Custom categories appear alongside the defaults in all transaction forms, import mapping, and budget setup.
4. You can delete custom categories at any time. Deleting a custom category does not remove it from existing transactions -- those transactions simply retain the category text.

---

## Setting Up APR Rates for Credit Cards

Credit card accounts support multiple APR rates, each with a different type. This allows accurate interest calculation when different portions of your balance carry different rates.

1. Navigate to the credit card account detail page.
2. Look for the **APR Rates** section.
3. Click **Add Rate** and fill in:
   - **Rate type** -- one of:
     - **Standard** -- the regular purchase APR
     - **Introductory** -- a temporary lower rate for new accounts
     - **Balance Transfer** -- rate applied to transferred balances
     - **Cash Advance** -- rate for cash withdrawals
     - **Penalty** -- elevated rate triggered by missed payments
     - **Promotional** -- limited-time offer rate
   - **APR (%)** -- the annual percentage rate
   - **Effective date** -- when the rate starts
   - **Expiration date** (optional) -- when the rate ends; expired rates are automatically cleaned up by the cron job
4. Click **Save**.

You can also assign a specific APR rate to individual transactions, so purchases made under a promotional offer are tracked separately from standard purchases.

---

## Configuring Credit Card Grace Periods

The grace period determines whether new purchases accrue interest immediately or only after the next statement due date.

1. Navigate to the credit card account detail page.
2. Open the account settings or edit view.
3. Set the **Grace Period Days** field (typically 21-25 days).
4. The system uses this to determine interest behavior:
   - If the prior statement balance was **paid in full** by the due date, new purchases during the current cycle do **not** accrue interest (grace period is active).
   - If there is a **carried balance**, new purchases accrue interest from the date of purchase.

---

## CSV Import Guide

The import system is flexible enough to handle most bank and credit card export formats.

### Supported Amount Column Patterns

1. **Single signed amount** -- One column contains positive values for deposits and negative values for withdrawals (or vice versa). This is the most common format.

2. **Separate debit/credit columns** -- Two columns: one for debits (withdrawals) and one for credits (deposits). One column is blank when the other has a value.

3. **Amount + type indicator** -- One column has the amount (always positive) and a second column indicates whether it is a debit or credit (e.g., "DR"/"CR", "Debit"/"Credit").

### Import Steps

1. Go to **Import** in the sidebar.
2. Select the target account for the import.
3. Upload your CSV file.
4. Map the columns:
   - **Date** -- the transaction date column
   - **Description** -- the payee or memo column
   - **Amount** -- the amount column(s), choosing the appropriate pattern above
5. Preview the parsed transactions. The system highlights:
   - **Exact duplicates** -- transactions matching an existing record on date, amount, and description
   - **Fuzzy matches** -- transactions that are very similar to existing records (Levenshtein distance < 3)
6. Deselect any duplicates you want to skip.
7. Click **Import** to save the transactions.

All imported transactions are tagged with the source `Import` so you can filter or identify them later.

---

## Recurring Bills

### Setting Up a Recurring Bill

1. Navigate to **Recurring** in the sidebar.
2. Click **Add Recurring**.
3. Fill in the details:
   - **Name** -- the bill name (e.g., "Electric Bill", "Netflix")
   - **Amount** -- the expected payment amount
   - **Account** -- which account the payment comes from
   - **Category** -- the transaction category
   - **Frequency** -- Monthly, Quarterly, or Annually
   - **Next Due Date** -- when the next occurrence should be generated
   - **Variable amount** -- toggle this on if the amount changes each period (e.g., utility bills)

### How It Works

- The cron container checks daily for recurring bills that are due.
- **Fixed amount bills** are generated automatically as transactions.
- **Variable amount bills** are generated as estimated transactions and flagged for your confirmation. You can review and adjust the amount before finalizing.
- After a bill is generated, the next due date advances automatically based on the frequency.

---

## Backup & Restore

### JSON Export

1. Go to **Settings**.
2. Use the **Export Data** option to download a JSON file containing your accounts, transactions, and configuration.
3. Store this file securely as a backup.

### Database Dump via Docker

For a full database backup:

```bash
docker compose exec db pg_dump -U postgres personalledgr > backup.sql
```

To restore from a backup:

```bash
docker compose exec -T db psql -U postgres personalledgr < backup.sql
```

---

## Plaid Bank Connection

Automatic bank synchronization via Plaid is planned for a future release. This feature will allow you to connect your bank accounts and automatically import transactions. Check the project repository for updates on this feature.
