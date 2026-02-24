import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Budgets", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/budgets")
  })

  test("budgets page loads with heading", async ({ page }) => {
    // The h1 appears in both the sticky banner and the page content — scope to main
    await expect(page.getByRole("main").getByRole("heading", { name: "Budgets" })).toBeVisible()
  })

  test("month navigation controls are visible", async ({ page }) => {
    // Use exact aria-label to avoid matching "Copy from Previous Month" button
    await expect(page.getByRole("button", { name: "Previous month", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Next month", exact: true })).toBeVisible()
    // The current period label (e.g. "February 2026") is shown between the nav arrows
    await expect(page.getByText(/january|february|march|april|may|june|july|august|september|october|november|december/i)).toBeVisible()
  })

  test("Add Budget button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add budget/i }).first()).toBeVisible()
  })

  test("Copy from Previous Month button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /copy from previous month/i })
    ).toBeVisible()
  })

  test("opens Add Budget dialog on button click", async ({ page }) => {
    await page.getByRole("button", { name: /add budget/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(
      page.getByRole("heading", { name: /add budget/i })
    ).toBeVisible()
  })

  test("Add Budget dialog has category and monthly limit fields", async ({ page }) => {
    await page.getByRole("button", { name: /add budget/i }).first().click()
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByLabel(/category/i)).toBeVisible()
    await expect(dialog.getByLabel(/monthly limit/i)).toBeVisible()
  })

  test("creates a budget and progress bar appears", async ({ page }) => {
    await page.getByRole("button", { name: /add budget/i }).first().click()
    const dialog = page.getByRole("dialog")

    // Select a category — try multiple options to find one not already budgeted
    await dialog.getByLabel(/category/i).click()
    const options = page.getByRole("option")
    const optionCount = await options.count().catch(() => 0)
    if (optionCount === 0) {
      await dialog.getByRole("button", { name: /cancel/i }).click()
      test.skip()
      return
    }

    // Try each option until one succeeds (seeded data may already have some budgeted)
    let created = false
    for (let i = 0; i < optionCount && !created; i++) {
      const option = options.nth(i)
      const optionVisible = await option.isVisible().catch(() => false)
      if (!optionVisible) {
        // Dropdown may have closed; reopen it
        await dialog.getByLabel(/category/i).click()
      }
      await options.nth(i).click()

      await dialog.getByLabel(/monthly limit/i).fill("300.00")
      await dialog.getByRole("button", { name: /create budget/i }).click()

      // Check if dialog closed (success) or stayed open (validation error)
      const dialogHidden = await dialog
        .waitFor({ state: "hidden", timeout: 3_000 })
        .then(() => true)
        .catch(() => false)

      if (dialogHidden) {
        created = true
      } else {
        // Category already budgeted — try next option
        await dialog.getByLabel(/category/i).click()
      }
    }

    if (!created) {
      // All categories already have budgets — skip gracefully
      await dialog.getByRole("button", { name: /cancel/i }).click()
      test.skip()
      return
    }

    // A budget progress bar should now be visible on the page
    // BudgetBar renders a <progress> element or a div acting as a bar
    await expect(page.locator("progress, [role='progressbar']").first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test("summary bar shows Total Budgeted, Total Spent, Remaining when budgets exist", async ({
    page,
  }) => {
    const isEmptyState = await page
      .getByText(/no budgets for this month/i)
      .isVisible()
      .catch(() => false)
    if (isEmptyState) {
      test.skip()
      return
    }

    await expect(page.getByText(/total budgeted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/total spent/i)).toBeVisible()
    // Use exact text to avoid matching per-budget "Remaining: $x.xx" labels
    await expect(page.getByText("Remaining", { exact: true })).toBeVisible()
  })

  test("navigating to the previous month changes the displayed period", async ({
    page,
  }) => {
    // The month/year label has class "min-w-[140px] text-center" — use a specific locator
    const periodLabel = page.locator("span.text-center").filter({ hasText: /\d{4}/ })
    const periodLabelBefore = await periodLabel.textContent()

    await page.getByRole("button", { name: "Previous month", exact: true }).click()

    const periodLabelAfter = await periodLabel.textContent()

    expect(periodLabelAfter).not.toBe(periodLabelBefore)
  })
})
