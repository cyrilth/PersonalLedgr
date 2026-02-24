import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Budgets", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/budgets")
  })

  test("budgets page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()
  })

  test("month navigation controls are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /previous month/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /next month/i })).toBeVisible()
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

    // Select a category
    await dialog.getByLabel(/category/i).click()
    const options = page.getByRole("option")
    const hasOptions = await options.first().isVisible().catch(() => false)
    if (!hasOptions) {
      await dialog.getByRole("button", { name: /cancel/i }).click()
      test.skip()
      return
    }
    await options.first().click()

    await dialog.getByLabel(/monthly limit/i).fill("300.00")
    await dialog.getByRole("button", { name: /create budget/i }).click()

    // Dialog should close
    await expect(dialog).toBeHidden({ timeout: 10_000 })

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
    await expect(page.getByText(/remaining/i)).toBeVisible()
  })

  test("navigating to the previous month changes the displayed period", async ({
    page,
  }) => {
    const periodLabelBefore = await page
      .locator("span")
      .filter({ hasText: /\d{4}/ })
      .textContent()

    await page.getByRole("button", { name: /previous month/i }).click()

    const periodLabelAfter = await page
      .locator("span")
      .filter({ hasText: /\d{4}/ })
      .textContent()

    expect(periodLabelAfter).not.toBe(periodLabelBefore)
  })
})
