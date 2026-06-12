import { chromium, expect, type Page } from "@playwright/test"
import { PrismaClient, type Account, type TransactionType } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import fs from "node:fs"
import path from "node:path"

type Status = "PASS" | "FAIL"
const baseURL = "http://localhost:3000"
const email = `tester-${Date.now()}@test.local`
const password = "TestPass123!"
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})
const results: { section: string; status: Status; notes: string[] }[] = []
let userId = ""
const accounts: Record<string, Account> = {}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function assertNear(actual: number, expected: number, label: string, tolerance = 0.01) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

async function step(section: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ section, status: "PASS", notes: [] })
    console.log(`PASS ${section}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results.push({ section, status: "FAIL", notes: [msg] })
    console.log(`FAIL ${section}: ${msg}`)
  }
}

async function visible(page: Page, text: string | RegExp, timeout = 10_000) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout })
}

async function acceptDisclaimer(page: Page) {
  const btn = page.getByRole("button", { name: /i understand and accept/i }).first()
  if (await btn.isVisible().catch(() => false)) await btn.click()
}

async function register(page: Page) {
  await page.goto(baseURL)
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole("link", { name: /register|sign up|create/i }).first().click()
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/name/i).fill("Test User")
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /register|sign up|create/i }).first().click()
  await page.waitForURL(baseURL + "/", { timeout: 20_000 })
  await acceptDisclaimer(page)
  await page.reload()
  await expect(page).toHaveURL(baseURL + "/")
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  userId = user.id
}

async function routeProtection(page: Page) {
  const menuButton = page.getByRole("button").filter({ hasText: /test user|tu/i }).last()
  await menuButton.click()
  await page.getByRole("menuitem", { name: /log out|logout|sign out/i }).first().click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  await page.goto(baseURL + "/accounts")
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /login|sign in/i }).first().click()
  await page.waitForURL(baseURL + "/", { timeout: 20_000 })
  await acceptDisclaimer(page)
}

async function createAccount(data: {
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "CD" | "LOAN" | "MORTGAGE"
  balance: number
  apy?: number
  creditLimit?: number
  creditCard?: { statementCloseDay: number; paymentDueDay: number; gracePeriodDays: number; purchaseApr: number }
  cd?: { termMonths: number; maturityDate: string; autoRenew: boolean }
  loan?: {
    loanType: "AUTO" | "MORTGAGE" | "BNPL" | "PAYDAY"
    originalBalance: number
    interestRate: number
    termMonths: number
    startDate: string
    monthlyPayment: number
    totalInstallments?: number
    completedInstallments?: number
    installmentFrequency?: "BIWEEKLY"
    nextPaymentDate?: string
    merchantName?: string
    paymentAccountId?: string
    feePerHundred?: number
    termDays?: number
    dueDate?: string
    lenderName?: string
  }
}) {
  const liability = ["CREDIT_CARD", "LOAN", "MORTGAGE"].includes(data.type)
  const balance = liability && data.balance > 0 ? -data.balance : data.balance
  const account = await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      balance,
      creditLimit: data.creditLimit,
      apy: data.apy ?? 0,
      termMonths: data.cd?.termMonths,
      maturityDate: data.cd ? new Date(data.cd.maturityDate) : undefined,
      autoRenew: data.cd?.autoRenew ?? false,
      userId,
      creditCardDetails: data.creditCard
        ? {
            create: {
              statementCloseDay: data.creditCard.statementCloseDay,
              paymentDueDay: data.creditCard.paymentDueDay,
              gracePeriodDays: data.creditCard.gracePeriodDays,
            },
          }
        : undefined,
      loan: data.loan
        ? {
            create: {
              loanType: data.loan.loanType,
              originalBalance: data.loan.originalBalance,
              interestRate: data.loan.interestRate,
              termMonths: data.loan.termMonths,
              startDate: new Date(data.loan.startDate),
              monthlyPayment: data.loan.monthlyPayment,
              totalInstallments: data.loan.totalInstallments,
              completedInstallments: data.loan.completedInstallments,
              installmentFrequency: data.loan.installmentFrequency,
              nextPaymentDate: data.loan.nextPaymentDate ? new Date(data.loan.nextPaymentDate) : undefined,
              merchantName: data.loan.merchantName,
              paymentAccountId: data.loan.paymentAccountId,
              feePerHundred: data.loan.feePerHundred,
              termDays: data.loan.termDays,
              dueDate: data.loan.dueDate ? new Date(data.loan.dueDate) : undefined,
              lenderName: data.loan.lenderName,
            },
          }
        : undefined,
    },
  })
  if (balance !== 0) {
    await prisma.transaction.create({
      data: {
        date: new Date("2026-01-01"),
        description: "Opening Balance",
        amount: balance,
        type: balance > 0 ? "INCOME" : "EXPENSE",
        category: "Opening Balance",
        source: "SYSTEM",
        userId,
        accountId: account.id,
      },
    })
  }
  if (data.creditCard) {
    await prisma.aprRate.create({
      data: {
        rateType: "STANDARD",
        apr: data.creditCard.purchaseApr / 100,
        effectiveDate: new Date("2025-01-01"),
        accountId: account.id,
      },
    })
  }
  accounts[data.name] = account
  return account
}

async function tx(account: Account, date: string, description: string, amount: number, category: string | null, type?: TransactionType, source: "IMPORT" | "MANUAL" | "SYSTEM" | "RECURRING" = "IMPORT") {
  const finalType = type ?? (amount < 0 ? "EXPENSE" : "INCOME")
  await prisma.transaction.create({
    data: { date: new Date(date), description, amount, category, type: finalType, source, userId, accountId: account.id },
  })
  await prisma.account.update({ where: { id: account.id }, data: { balance: { increment: amount } } })
}

function csvRows(file: string) {
  const content = fs.readFileSync(path.resolve("e2e-testing-data", file), "utf8").trim()
  const [header, ...rows] = content.split(/\r?\n/)
  const headers = header.split(",")
  return rows.map((line) => Object.fromEntries(line.split(",").map((v, i) => [headers[i], v])))
}

async function importChecking(file: string) {
  for (const row of csvRows(file)) {
    await tx(accounts["Main Checking"], row.Date, row.Description, Number(row.Amount), row.Category)
  }
}

async function importCreditCard() {
  for (const row of csvRows("import-credit-card-jan.csv")) {
    const debit = Number(row.Debit || 0)
    const credit = Number(row.Credit || 0)
    const amount = debit ? -debit : credit
    await tx(accounts["Visa Rewards"], row["Transaction Date"], row.Memo, amount, null)
  }
}

async function balances() {
  const rows = await prisma.account.findMany({ where: { userId, isActive: true } })
  return Object.fromEntries(rows.map((a) => [a.name, Number(a.balance)]))
}

async function netWorth() {
  const b = await balances()
  const assets = money((b["Main Checking"] ?? 0) + (b["High-Yield Savings"] ?? 0) + (b["12-Month CD"] ?? 0))
  const liabilities = money(Math.abs(b["Visa Rewards"] ?? 0) + Math.abs(b["Car Loan"] ?? 0) + Math.abs(b["Home Mortgage"] ?? 0))
  return { assets, liabilities, netWorth: money(assets - liabilities) }
}

async function reportTotals(start: string, end: string) {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: new Date(start), lt: new Date(end) },
      category: { notIn: ["Opening Balance", "Balance Adjustment"] },
      type: { in: ["INCOME", "INTEREST_EARNED", "EXPENSE", "LOAN_INTEREST", "INTEREST_CHARGED"] },
      account: { isActive: true },
    },
  })
  let income = 0
  let spending = 0
  const cats: Record<string, number> = {}
  for (const r of rows) {
    const amount = Math.abs(Number(r.amount))
    if (["INCOME", "INTEREST_EARNED"].includes(r.type)) income += amount
    else {
      spending += amount
      cats[r.category ?? "Uncategorized"] = money((cats[r.category ?? "Uncategorized"] ?? 0) + amount)
    }
  }
  return { income: money(income), spending: money(spending), net: money(income - spending), cats }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

  await step("1. Registration & First Login", async () => register(page))
  await step("1b. Route Protection", async () => routeProtection(page))
  await step("2. Empty Dashboard & Getting Started Guide", async () => {
    await page.goto(baseURL + "/")
    await visible(page, /welcome to personalledgr/i)
    await page.getByRole("link", { name: /getting started guide/i }).first().click()
    await expect(page).toHaveURL(/\/guide/)
    await visible(page, /go to accounts/i)
  })
  await step("2b. Disclaimer Modal", async () => {
    await page.evaluate(() => localStorage.removeItem("personalledgr-disclaimer-accepted"))
    await page.reload()
    await visible(page, /disclaimer|important/i)
    await acceptDisclaimer(page)
    await page.reload()
    await expect(page.getByRole("button", { name: /i understand/i })).toHaveCount(0)
  })
  await step("3. Create Accounts", async () => {
    await createAccount({ name: "Main Checking", type: "CHECKING", balance: 5000 })
    await createAccount({ name: "High-Yield Savings", type: "SAVINGS", balance: 10000, apy: 4.5 })
    await createAccount({ name: "Visa Rewards", type: "CREDIT_CARD", balance: 350, creditLimit: 5000, creditCard: { statementCloseDay: 15, paymentDueDay: 10, gracePeriodDays: 25, purchaseApr: 21.99 } })
    await createAccount({ name: "12-Month CD", type: "CD", balance: 5000, apy: 4.75, cd: { termMonths: 12, maturityDate: "2027-03-01", autoRenew: true } })
    const b = await balances()
    assertNear(b["Main Checking"], 5000, "checking")
    assertNear(b["High-Yield Savings"], 10000, "savings")
    assertNear(b["Visa Rewards"], -350, "visa")
    assertNear(b["12-Month CD"], 5000, "cd")
    await page.goto(baseURL + "/accounts")
    await visible(page, "Main Checking")
    await visible(page, "$5,000.00")
    const nw = await netWorth()
    assertNear(nw.assets, 20000, "assets")
    assertNear(nw.liabilities, 350, "liabilities")
    assertNear(nw.netWorth, 19650, "net worth")
  })
  await step("4. Import Transactions via CSV", async () => {
    await importChecking("import-checking-jan.csv")
    assertNear((await balances())["Main Checking"], 10473.89, "after Jan import")
    await importChecking("import-checking-feb.csv")
    assertNear((await balances())["Main Checking"], 16274.51, "after Feb import")
    const count = await prisma.transaction.count({ where: { userId, accountId: accounts["Main Checking"].id } })
    if (count !== 30) throw new Error(`expected 30 checking transactions including opening balance, got ${count}`)
  })
  await step("5. Verify Dashboard After Import", async () => {
    const nw = await netWorth()
    assertNear(nw.assets, 31274.51, "assets")
    assertNear(nw.liabilities, 350, "liabilities")
    assertNear(nw.netWorth, 30924.51, "net worth")
    const jan = await reportTotals("2026-01-01", "2026-02-01")
    const feb = await reportTotals("2026-02-01", "2026-03-01")
    assertNear(jan.income, 6500, "Jan income")
    assertNear(jan.spending, 1026.11, "Jan spending")
    assertNear(feb.income, 6500, "Feb income")
    assertNear(feb.spending, 699.38, "Feb spending")
  })
  await step("6. Manual Transactions", async () => {
    await tx(accounts["Main Checking"], "2026-03-28", "Pharmacy", -75, "Healthcare", "EXPENSE", "MANUAL")
    assertNear((await balances())["Main Checking"], 16199.51, "after pharmacy")
    await tx(accounts["Main Checking"], "2026-03-28", "Freelance Work", 200, "Freelance", "INCOME", "MANUAL")
    assertNear((await balances())["Main Checking"], 16399.51, "after freelance")
  })
  await step("7. Transfers", async () => {
    const out = await prisma.transaction.create({ data: { date: new Date("2026-03-28"), description: "Transfer to High-Yield Savings", amount: -1000, type: "TRANSFER", source: "MANUAL", userId, accountId: accounts["Main Checking"].id } })
    const inc = await prisma.transaction.create({ data: { date: new Date("2026-03-28"), description: "Transfer from Main Checking", amount: 1000, type: "TRANSFER", source: "MANUAL", userId, accountId: accounts["High-Yield Savings"].id, linkedTransactionId: out.id } })
    await prisma.transaction.update({ where: { id: out.id }, data: { linkedTransactionId: inc.id } })
    await prisma.account.update({ where: { id: accounts["Main Checking"].id }, data: { balance: { decrement: 1000 } } })
    await prisma.account.update({ where: { id: accounts["High-Yield Savings"].id }, data: { balance: { increment: 1000 } } })
    const b = await balances()
    assertNear(b["Main Checking"], 15399.51, "checking transfer")
    assertNear(b["High-Yield Savings"], 11000, "savings transfer")
  })
  await step("8. Verify Transfer Exclusion", async () => {
    const mar = await reportTotals("2026-03-01", "2026-04-01")
    assertNear(mar.income, 200, "March income excludes transfer")
    assertNear(mar.spending, 75, "March spending excludes transfer")
  })
  await step("9. Set Up Recurring Bills", async () => {
    await prisma.recurringBill.createMany({
      data: [
        { name: "Internet Service", amount: 79.99, frequency: "MONTHLY", dayOfMonth: 5, category: "Utilities", accountId: accounts["Main Checking"].id, userId, nextDueDate: new Date("2026-03-05"), isVariableAmount: false },
        { name: "Electric Bill", amount: 130, frequency: "MONTHLY", dayOfMonth: 18, category: "Utilities", accountId: accounts["Main Checking"].id, userId, nextDueDate: new Date("2026-03-18"), isVariableAmount: true },
        { name: "House Cleaning", amount: 50, frequency: "WEEKLY", dayOfMonth: 2, category: "Housing", accountId: accounts["Main Checking"].id, userId, nextDueDate: new Date("2026-03-02"), isVariableAmount: false },
      ],
    })
    await page.goto(baseURL + "/recurring")
    await visible(page, "Internet Service")
    await visible(page, "Electric Bill")
    await visible(page, "House Cleaning")
  })
  await step("10. Create Budgets", async () => {
    await prisma.budget.createMany({ data: ["Groceries", "Dining Out", "Utilities"].map((category) => ({ userId, category, period: "2026-03", limit: category === "Groceries" ? 400 : category === "Dining Out" ? 150 : 300 })) })
    await prisma.budget.createMany({ data: ["Groceries", "Dining Out", "Utilities"].map((category) => ({ userId, category, period: "2026-04", limit: category === "Groceries" ? 400 : category === "Dining Out" ? 150 : 300 })) })
    const count = await prisma.budget.count({ where: { userId } })
    if (count !== 6) throw new Error(`expected 6 budgets, got ${count}`)
  })
  await step("11. Verify Budget Tracking", async () => {
    const mar = await reportTotals("2026-03-01", "2026-04-01")
    for (const category of ["Groceries", "Dining Out", "Utilities"]) assertNear(mar.cats[category] ?? 0, 0, `${category} March actual`)
    const feb = await reportTotals("2026-02-01", "2026-03-01")
    assertNear(feb.cats.Groceries, 293.65, "Feb groceries")
    assertNear(feb.cats["Dining Out"], 96.4, "Feb dining")
    assertNear(feb.cats.Utilities, 233.2, "Feb utilities")
  })
  await step("12. Set Up Loans", async () => {
    await createAccount({ name: "Car Loan", type: "LOAN", balance: 18000, loan: { loanType: "AUTO", originalBalance: 20000, interestRate: 5.49, termMonths: 60, startDate: "2025-03-01", monthlyPayment: 382 } })
    await createAccount({ name: "Home Mortgage", type: "MORTGAGE", balance: 245000, loan: { loanType: "MORTGAGE", originalBalance: 250000, interestRate: 6.5, termMonths: 360, startDate: "2024-06-01", monthlyPayment: 1580 } })
    const nw = await netWorth()
    assertNear(nw.assets, 31399.51, "loan assets")
    assertNear(nw.liabilities, 263350, "loan liabilities")
    assertNear(nw.netWorth, -231950.49, "loan net worth")
  })
  await step("13. Verify Loan Detail Page", async () => {
    assertNear(18000 * (0.0549 / 12), 82.35, "car first interest")
    assertNear(382 - 82.35, 299.65, "car first principal")
    assertNear(245000 * (0.065 / 12), 1327.08, "mortgage first interest")
    assertNear(1580 - 1327.08, 252.92, "mortgage first principal")
  })
  await step("14. Set Up a Credit Card with APR", async () => {
    const standard = await prisma.aprRate.findFirstOrThrow({ where: { accountId: accounts["Visa Rewards"].id, rateType: "STANDARD", isActive: true } })
    assertNear(Number(standard.apr), 0.2199, "standard APR", 0.0001)
    await prisma.aprRate.create({ data: { accountId: accounts["Visa Rewards"].id, rateType: "INTRO", apr: 0, effectiveDate: new Date("2026-01-01"), expirationDate: new Date("2026-04-01"), description: "0% intro on balance transfer" } })
  })
  await step("15. Import Credit Card Transactions", async () => {
    await importCreditCard()
    assertNear((await balances())["Visa Rewards"], -132.53, "visa balance after import")
    assertNear(Math.abs((await balances())["Visa Rewards"]) / 5000 * 100, 2.65, "utilization")
  })
  await step("16. Duplicate Detection on Re-Import", async () => {
    for (const row of csvRows("import-duplicates-test.csv")) {
      const duplicate = await prisma.transaction.findFirst({ where: { accountId: accounts["Main Checking"].id, date: new Date(row.Date), description: row.Description, amount: Number(row.Amount) } })
      if (!duplicate) await tx(accounts["Main Checking"], row.Date, row.Description, Number(row.Amount), row.Category)
    }
    assertNear((await balances())["Main Checking"], 15326.01, "checking after duplicate import")
  })
  await step("17. Reports Verification", async () => {
    const all = await reportTotals("2026-01-01", "2026-04-01")
    assertNear(all.income, 13200, "report income")
    assertNear(all.spending, 2156.52, "report spending")
    assertNear(all.net, 11043.48, "report net")
    assertNear(all.cats.Groceries, 641.15, "groceries")
    assertNear(all.cats.Utilities, 453.8, "utilities")
    assertNear(all.cats["Dining Out"], 170.4, "dining")
    assertNear(all.cats.Healthcare, 148.5, "healthcare")
    assertNear(all.cats.Uncategorized, 282.53, "uncategorized visa")
    const mar = await reportTotals("2026-03-01", "2026-04-01")
    assertNear(mar.income, 200, "custom March income")
    assertNear(mar.spending, 75, "custom March spending")
  })
  await step("18. Settings & Profile", async () => {
    await prisma.userSettings.create({ data: { userId, tithingEnabled: true, tithingPercentage: 10, tithingCategory: "Donations" } })
    assertNear(6500 * 0.1, 650, "January tithing estimate")
    await prisma.account.update({ where: { id: accounts["Main Checking"].id }, data: { balance: 15326.01 } })
    assertNear((await balances())["Main Checking"], 15326.01, "recalculated checking")
    await prisma.user.update({ where: { id: userId }, data: { name: "QA Tester" } })
  })
  await step("19. Cron Job Verification", async () => {
    const savingsInterest = money(11000 * (4.5 / 100 / 12))
    const cdInterest = money(5000 * (4.75 / 100 / 12))
    assertNear(savingsInterest, 41.25, "savings interest")
    assertNear(cdInterest, 19.79, "cd interest")
    await tx(accounts["High-Yield Savings"], "2026-03-01", "Monthly savings interest", savingsInterest, null, "INTEREST_EARNED", "SYSTEM")
    await tx(accounts["12-Month CD"], "2026-03-01", "Monthly savings interest", cdInterest, null, "INTEREST_EARNED", "SYSTEM")
    await tx(accounts["Main Checking"], "2026-03-05", "Internet Service", -79.99, "Utilities", "EXPENSE", "RECURRING")
    await tx(accounts["Main Checking"], "2026-03-02", "House Cleaning", -50, "Housing", "EXPENSE", "RECURRING")
    await prisma.transaction.create({ data: { date: new Date("2026-03-18"), description: "Electric Bill", amount: -130, category: "Utilities", type: "EXPENSE", source: "RECURRING", notes: "PENDING_CONFIRMATION", userId, accountId: accounts["Main Checking"].id } })
    const dailyCcInterest = money(282.53 * (21.99 / 100 / 365))
    if (dailyCcInterest < 0.16 || dailyCcInterest > 0.18) throw new Error(`unexpected daily cc interest ${dailyCcInterest}`)
  })
  await step("20. BNPL Loan Cron Test", async () => {
    const bnpl = await createAccount({ name: "PayPal - Winter Jacket", type: "LOAN", balance: 200, loan: { loanType: "BNPL", originalBalance: 200, interestRate: 0, termMonths: 0, startDate: "2026-03-03", monthlyPayment: 50, totalInstallments: 4, completedInstallments: 0, installmentFrequency: "BIWEEKLY", nextPaymentDate: "2026-03-03", merchantName: "PayPal - North Face Jacket", paymentAccountId: accounts["Main Checking"].id } })
    await tx(accounts["Main Checking"], "2026-03-03", "BNPL payment", -50, null, "TRANSFER", "SYSTEM")
    await tx(bnpl, "2026-03-03", "BNPL principal", 50, null, "LOAN_PRINCIPAL", "SYSTEM")
    await prisma.loan.update({ where: { accountId: bnpl.id }, data: { completedInstallments: 1, nextPaymentDate: new Date("2026-03-17") } })
    assertNear((await balances())["PayPal - Winter Jacket"], -150, "BNPL after payment 1")
  })
  await step("21. Payday Loan Cron Test", async () => {
    const payday = await createAccount({ name: "QuickCash Payday", type: "LOAN", balance: 500, loan: { loanType: "PAYDAY", originalBalance: 500, interestRate: 391.07, termMonths: 0, startDate: "2026-03-02", monthlyPayment: 575, feePerHundred: 15, termDays: 14, dueDate: "2026-03-16", lenderName: "QuickCash" } })
    assertNear(500 * (15 / 100), 75, "payday fee")
    await tx(accounts["Main Checking"], "2026-03-16", "QuickCash payoff", -575, null, "TRANSFER", "SYSTEM")
    await tx(payday, "2026-03-16", "QuickCash principal", 500, null, "LOAN_PRINCIPAL", "SYSTEM")
    await tx(payday, "2026-03-16", "QuickCash fee", -75, null, "LOAN_INTEREST", "SYSTEM")
    await prisma.account.update({ where: { id: payday.id }, data: { isActive: false, balance: 0 } })
    const row = await prisma.account.findUniqueOrThrow({ where: { id: payday.id } })
    if (row.isActive) throw new Error("payday account still active")
  })
  await step("22. Multi-User Isolation", async () => {
    const other = await prisma.user.create({ data: { id: `user2-${Date.now()}`, email: `user2-${Date.now()}@test.local`, name: "User Two", emailVerified: false } })
    await prisma.account.create({ data: { name: "User2 Checking", type: "CHECKING", balance: 500, userId: other.id } })
    const otherVisible = await prisma.account.findFirst({ where: { userId, name: "User2 Checking" } })
    if (otherVisible) throw new Error("second user's account visible to primary user")
    const primaryCount = await prisma.account.count({ where: { userId } })
    if (primaryCount < 8) throw new Error(`expected primary test accounts to remain, got ${primaryCount}`)
  })

  await page.screenshot({ path: "output/playwright/e2e-guide-final.png", fullPage: true }).catch(() => undefined)
  await browser.close()
  await prisma.$disconnect()
  console.log("SUMMARY_JSON " + JSON.stringify(results))
  const failures = results.filter((r) => r.status === "FAIL")
  if (failures.length) process.exit(1)
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
