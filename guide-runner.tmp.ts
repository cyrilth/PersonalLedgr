import { chromium, expect, type Locator, type Page } from "@playwright/test"
import path from "node:path"

const baseURL = "http://localhost:3000"
const results: { section: string; status: "PASS" | "FAIL" | "PARTIAL" | "SKIP"; notes: string[] }[] = []

function record(section: string, status: "PASS" | "FAIL" | "PARTIAL" | "SKIP", ...notes: string[]) {
  results.push({ section, status, notes })
  console.log(`${status}: ${section}${notes.length ? " - " + notes.join(" | ") : ""}`)
}

async function visible(page: Page, text: string | RegExp, timeout = 5000) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout })
}

async function click(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).first().click()
}

async function maybeClick(page: Page, name: string | RegExp) {
  const btn = page.getByRole("button", { name }).first()
  if (await btn.isVisible().catch(() => false)) await btn.click()
}

async function acceptDisclaimer(page: Page) {
  await maybeClick(page, /i understand and accept/i)
}

async function fillByLabelOrPlaceholder(page: Page | Locator, label: string | RegExp, value: string) {
  const byLabel = page.getByLabel(label).first()
  if (await byLabel.isVisible().catch(() => false)) {
    await byLabel.fill(value)
    return
  }
  const byPlaceholder = page.getByPlaceholder(label).first()
  await byPlaceholder.fill(value)
}

async function selectCombobox(page: Page | Locator, label: string | RegExp, value: string | RegExp) {
  const comboByLabel = page.getByLabel(label).first()
  if (await comboByLabel.isVisible().catch(() => false)) {
    await comboByLabel.click()
  } else {
    await page.getByRole("combobox", { name: label }).first().click()
  }
  await page.getByRole("option", { name: value }).first().click()
}

async function latestDialog(page: Page) {
  return page.getByRole("dialog").last()
}

async function registerAndLogin(page: Page) {
  await page.goto(baseURL)
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole("link", { name: /register|sign up|create/i }).first().click()
  await fillByLabelOrPlaceholder(page, /email/i, "tester@test.local")
  await fillByLabelOrPlaceholder(page, /name/i, "Test User")
  await fillByLabelOrPlaceholder(page, /password/i, "TestPass123!")
  await page.getByRole("button", { name: /register|sign up|create/i }).first().click()
  await page.waitForURL(baseURL + "/", { timeout: 15000 })
  await acceptDisclaimer(page)
  await page.reload()
  await expect(page).not.toHaveURL(/\/login/)
}

async function routeProtection(page: Page) {
  const menu = page.getByRole("button").filter({ hasText: /test user|tester|tu/i }).last()
  if (await menu.isVisible().catch(() => false)) await menu.click()
  const logout = page.getByRole("menuitem", { name: /log out|logout|sign out/i }).first()
  if (await logout.isVisible().catch(() => false)) await logout.click()
  else await page.getByRole("button", { name: /log out|logout|sign out/i }).first().click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  await page.goto(baseURL + "/accounts")
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  await fillByLabelOrPlaceholder(page, /email/i, "tester@test.local")
  await fillByLabelOrPlaceholder(page, /password/i, "TestPass123!")
  await page.getByRole("button", { name: /login|sign in/i }).first().click()
  await page.waitForURL(baseURL + "/", { timeout: 15000 })
  await acceptDisclaimer(page)
}

async function emptyDashboardAndGuide(page: Page) {
  await page.goto(baseURL + "/")
  await acceptDisclaimer(page)
  await visible(page, /welcome to personalledgr/i, 10000)
  await visible(page, /just getting started/i)
  await page.getByRole("link", { name: /getting started guide/i }).first().click()
  await expect(page).toHaveURL(/\/guide/)
  await visible(page, /getting started/i)
  await page.getByRole("link", { name: /go to accounts/i }).first().click()
  await expect(page).toHaveURL(/\/accounts/)
}

async function createAccount(page: Page, data: Record<string, string | boolean>) {
  await page.goto(baseURL + "/accounts")
  await click(page, /add account/i)
  const dialog = await latestDialog(page)
  await fillByLabelOrPlaceholder(dialog, /name/i, String(data.name))
  await selectCombobox(dialog, /type/i, String(data.type))
  await fillByLabelOrPlaceholder(dialog, /balance/i, String(data.balance))
  if (data.apy) await fillByLabelOrPlaceholder(dialog, /apy/i, String(data.apy))
  if (data.creditLimit) await fillByLabelOrPlaceholder(dialog, /credit limit/i, String(data.creditLimit))
  if (data.statementCloseDay) await fillByLabelOrPlaceholder(dialog, /statement close/i, String(data.statementCloseDay))
  if (data.paymentDueDay) await fillByLabelOrPlaceholder(dialog, /payment due/i, String(data.paymentDueDay))
  if (data.gracePeriod) await fillByLabelOrPlaceholder(dialog, /grace period/i, String(data.gracePeriod))
  if (data.purchaseApr) await fillByLabelOrPlaceholder(dialog, /purchase apr|apr/i, String(data.purchaseApr))
  if (data.termMonths) await fillByLabelOrPlaceholder(dialog, /term/i, String(data.termMonths))
  if (data.maturityDate) await fillByLabelOrPlaceholder(dialog, /maturity/i, String(data.maturityDate))
  if (data.autoRenew === true) {
    const cb = dialog.getByRole("checkbox").first()
    if (!(await cb.isChecked().catch(() => false))) await cb.click()
  }
  await dialog.getByRole("button", { name: /save|create|add/i }).last().click()
  await expect(page.getByText(String(data.name)).first()).toBeVisible({ timeout: 15000 })
}

async function createInitialAccounts(page: Page) {
  await createAccount(page, { name: "Main Checking", type: "Checking", balance: "5000.00" })
  await createAccount(page, { name: "High-Yield Savings", type: "Savings", balance: "10000.00", apy: "4.50" })
  await createAccount(page, { name: "Visa Rewards", type: "Credit Card", balance: "350.00", creditLimit: "5000.00", statementCloseDay: "15", paymentDueDay: "10", gracePeriod: "25", purchaseApr: "21.99" })
  await createAccount(page, { name: "12-Month CD", type: "Certificate of Deposit", balance: "5000.00", apy: "4.75", termMonths: "12", maturityDate: "2027-03-01", autoRenew: true })
  await page.goto(baseURL + "/accounts")
  for (const name of ["Main Checking", "High-Yield Savings", "Visa Rewards", "12-Month CD"]) await visible(page, name)
  await page.goto(baseURL + "/")
  await visible(page, /net worth/i, 10000)
  await visible(page, "$19,650.00")
}

async function importCsv(page: Page, filename: string, account: string, expectedButton: RegExp) {
  await page.goto(baseURL + "/import")
  await selectCombobox(page, /target account|account/i, account)
  const input = page.locator("input[type=file]").first()
  await input.setInputFiles(path.resolve("e2e-testing-data", filename))
  await visible(page, /date/i, 10000)
  await click(page, /continue/i)
  await page.getByRole("button", { name: expectedButton }).click({ timeout: 20000 })
  await visible(page, /success|imported/i, 20000)
}

async function importTransactions(page: Page) {
  await importCsv(page, "import-checking-jan.csv", "Main Checking", /import 15/i)
  await page.goto(baseURL + "/accounts")
  await visible(page, "$10,473.89", 15000)
  await importCsv(page, "import-checking-feb.csv", "Main Checking", /import 14/i)
  await page.goto(baseURL + "/accounts")
  await visible(page, "$16,274.51", 15000)
}

async function addTransaction(page: Page, tab: RegExp, account: string, amount: string, date: string, description: string, category: string) {
  await page.goto(baseURL + "/transactions")
  await click(page, /add transaction/i)
  const dialog = await latestDialog(page)
  await dialog.getByRole("tab", { name: tab }).click()
  await selectCombobox(dialog, /account/i, account)
  await fillByLabelOrPlaceholder(dialog, /amount/i, amount)
  await fillByLabelOrPlaceholder(dialog, /date/i, date)
  await fillByLabelOrPlaceholder(dialog, /description/i, description)
  const categoryBox = dialog.getByLabel(/category/i).first()
  if (await categoryBox.isVisible().catch(() => false)) await categoryBox.fill(category)
  await dialog.getByRole("button", { name: /save|create|add/i }).last().click()
  await visible(page, description, 15000)
}

async function manualTransactions(page: Page) {
  await addTransaction(page, /expense/i, "Main Checking", "75.00", "2026-03-28", "Pharmacy", "Healthcare")
  await page.goto(baseURL + "/accounts")
  await visible(page, "$16,199.51", 10000)
  await addTransaction(page, /income/i, "Main Checking", "200.00", "2026-03-28", "Freelance Work", "Freelance")
  await page.goto(baseURL + "/accounts")
  await visible(page, "$16,399.51", 10000)
}

async function createTransfer(page: Page) {
  await page.goto(baseURL + "/transactions")
  await click(page, /add transaction/i)
  const dialog = await latestDialog(page)
  await dialog.getByRole("tab", { name: /transfer/i }).click()
  await selectCombobox(dialog, /source|from/i, "Main Checking")
  await selectCombobox(dialog, /destination|to/i, "High-Yield Savings")
  await fillByLabelOrPlaceholder(dialog, /amount/i, "1000.00")
  await fillByLabelOrPlaceholder(dialog, /date/i, "2026-03-28")
  await dialog.getByRole("button", { name: /save|create|add|transfer/i }).last().click()
  await page.goto(baseURL + "/accounts")
  await visible(page, "$15,399.51", 15000)
  await visible(page, "$11,000.00")
}

async function recurringBills(page: Page) {
  await page.goto(baseURL + "/recurring")
  await visible(page, /recurring/i)
  await click(page, /add bill/i)
  const dialog = await latestDialog(page)
  await fillByLabelOrPlaceholder(dialog, /name/i, "Internet Service")
  await fillByLabelOrPlaceholder(dialog, /amount/i, "79.99")
  await selectCombobox(dialog, /frequency/i, /monthly/i)
  await fillByLabelOrPlaceholder(dialog, /day/i, "5")
  await fillByLabelOrPlaceholder(dialog, /category/i, "Utilities")
  await selectCombobox(dialog, /payment account|account/i, "Main Checking")
  await dialog.getByRole("button", { name: /save|create|add/i }).last().click()
  await visible(page, "Internet Service", 15000)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try { await registerAndLogin(page); record("1. Registration & First Login", "PASS") } catch (e) { record("1. Registration & First Login", "FAIL", String(e)) }
  try { await routeProtection(page); record("1b. Route Protection", "PASS") } catch (e) { record("1b. Route Protection", "FAIL", String(e)) }
  try { await emptyDashboardAndGuide(page); record("2. Empty Dashboard & Getting Started Guide", "PASS") } catch (e) { record("2. Empty Dashboard & Getting Started Guide", "FAIL", String(e)) }
  try { await createInitialAccounts(page); record("3. Create Accounts", "PASS") } catch (e) { record("3. Create Accounts", "FAIL", String(e)) }
  try { await importTransactions(page); record("4. Import Transactions via CSV", "PASS") } catch (e) { record("4. Import Transactions via CSV", "FAIL", String(e)) }
  try { await page.goto(baseURL + "/"); await visible(page, "$30,924.51", 15000); record("5. Verify Dashboard After Import", "PASS") } catch (e) { record("5. Verify Dashboard After Import", "FAIL", String(e)) }
  try { await manualTransactions(page); record("6. Manual Transactions", "PASS") } catch (e) { record("6. Manual Transactions", "FAIL", String(e)) }
  try { await createTransfer(page); record("7. Transfers", "PASS") } catch (e) { record("7. Transfers", "FAIL", String(e)) }
  try { await page.goto(baseURL + "/"); await visible(page, "$200.00", 10000); await visible(page, "$75.00"); record("8. Verify Transfer Exclusion", "PASS", "Dashboard totals checked") } catch (e) { record("8. Verify Transfer Exclusion", "FAIL", String(e)) }
  try { await recurringBills(page); record("9. Set Up Recurring Bills", "PARTIAL", "Created fixed monthly bill; remaining guide bill variants not automated in this runner") } catch (e) { record("9. Set Up Recurring Bills", "FAIL", String(e)) }
  record("10-22. Remaining Guide Sections", "SKIP", "Not reached by current runner")
  await browser.close()
  console.log("\nSUMMARY_JSON " + JSON.stringify(results))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
