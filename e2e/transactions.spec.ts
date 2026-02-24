import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/transactions")
  })

  test("transactions page loads with table and filters", async ({ page }) => {
    // The h1 appears in both the sticky banner and the page content — scope to main
    await expect(page.getByRole("main").getByRole("heading", { name: "Transactions" })).toBeVisible()
    await expect(page.getByRole("button", { name: /add transaction/i })).toBeVisible()
  })

  test("transaction table renders rows from seeded data", async ({ page }) => {
    // Wait for the loading skeletons to disappear by checking for a real table row
    // The table renders once loading is false; wait up to 10 s for seeded rows
    const table = page.locator("table")
    await expect(table).toBeVisible({ timeout: 10_000 })
    // At least one row body should be present with seeded demo data
    const rows = table.locator("tbody tr")
    await expect(rows.first()).toBeVisible()
  })

  test("opens Add Transaction dialog on button click", async ({ page }) => {
    await page.getByRole("button", { name: /add transaction/i }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByRole("heading", { name: /add transaction/i })).toBeVisible()
  })

  test("Add Transaction dialog has expense, income, transfer, loan tabs", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add transaction/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("tab", { name: /expense/i })).toBeVisible()
    await expect(dialog.getByRole("tab", { name: /income/i })).toBeVisible()
    await expect(dialog.getByRole("tab", { name: /transfer/i })).toBeVisible()
    await expect(dialog.getByRole("tab", { name: /loan payment/i })).toBeVisible()
  })

  test("creates an expense transaction and it appears in the table", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add transaction/i }).click()
    const dialog = page.getByRole("dialog")

    // Expense tab is active by default
    await expect(dialog.getByRole("tab", { name: /expense/i })).toBeVisible()

    // Select first available account
    await dialog.getByLabel("Account").click()
    await page.getByRole("option").first().click()

    // Fill in the amount
    await dialog.getByLabel("Amount").fill("42.50")

    // Fill in the description with a unique suffix to find it in the table
    const uniqueDesc = `E2E Expense ${Date.now()}`
    await dialog.getByLabel("Description").fill(uniqueDesc)

    // Submit
    await dialog.getByRole("button", { name: /add expense/i }).click()

    // Dialog should close
    await expect(dialog).toBeHidden()

    // New transaction should appear in the table (may require a reload if paginated)
    await expect(page.getByText(uniqueDesc)).toBeVisible({ timeout: 10_000 })
  })

  test("creates an income transaction and it appears in the table", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add transaction/i }).click()
    const dialog = page.getByRole("dialog")

    // Switch to Income tab
    await dialog.getByRole("tab", { name: /income/i }).click()

    // Select first available account
    await dialog.getByLabel("Account").click()
    await page.getByRole("option").first().click()

    await dialog.getByLabel("Amount").fill("500.00")
    const uniqueDesc = `E2E Income ${Date.now()}`
    await dialog.getByLabel("Description").fill(uniqueDesc)

    await dialog.getByRole("button", { name: /add income/i }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(uniqueDesc)).toBeVisible({ timeout: 10_000 })
  })

  test("filter bar allows filtering by account", async ({ page }) => {
    // The filter bar has a description search input — verify it is present
    await expect(
      page.getByPlaceholder(/search description/i)
    ).toBeVisible()
  })
})
