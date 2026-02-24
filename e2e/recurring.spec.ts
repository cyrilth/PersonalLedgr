import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Recurring Bills", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/recurring")
  })

  test("recurring bills page loads with heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /recurring bills/i })
    ).toBeVisible()
  })

  test("Add Bill button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add bill/i }).first()).toBeVisible()
  })

  test("view toggle (grid / calendar) is present", async ({ page }) => {
    // The grid/calendar toggle buttons are icon-only; check by aria-label or sr-only text
    await expect(page.getByRole("button", { name: /grid view/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /calendar view/i })).toBeVisible()
  })

  test("opens Add Recurring Bill dialog on button click", async ({ page }) => {
    await page.getByRole("button", { name: /add bill/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(
      page.getByRole("heading", { name: /add recurring bill/i })
    ).toBeVisible()
  })

  test("Add Recurring Bill form has all required fields", async ({ page }) => {
    await page.getByRole("button", { name: /add bill/i }).first().click()
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByLabel(/name/i)).toBeVisible()
    await expect(dialog.getByLabel(/amount/i)).toBeVisible()
    await expect(dialog.getByLabel(/frequency/i)).toBeVisible()
    await expect(dialog.getByLabel(/day of month/i)).toBeVisible()
    await expect(dialog.getByLabel(/payment account/i)).toBeVisible()
  })

  test("creates a recurring bill and it appears in the list", async ({ page }) => {
    await page.getByRole("button", { name: /add bill/i }).first().click()
    const dialog = page.getByRole("dialog")

    const uniqueName = `E2E Bill ${Date.now()}`
    await dialog.getByLabel(/name/i).fill(uniqueName)
    await dialog.getByLabel(/amount/i).fill("75.00")
    await dialog.getByLabel(/day of month/i).fill("15")

    // Select a payment account
    await dialog.getByLabel(/payment account/i).click()
    const options = page.getByRole("option")
    const hasOptions = await options.first().isVisible().catch(() => false)
    if (!hasOptions) {
      // No accounts available — close dialog and skip
      await dialog.getByRole("button", { name: /cancel/i }).click()
      test.skip()
      return
    }
    await options.first().click()

    await dialog.getByRole("button", { name: /create bill/i }).click()

    // Dialog should close after success
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // The new bill should appear in the grid
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })
  })

  test("switching to calendar view shows the bills calendar", async ({ page }) => {
    // Only visible when bills exist; skip gracefully if page is in empty state
    const isEmptyState = await page
      .getByText(/no recurring bills yet/i)
      .isVisible()
      .catch(() => false)
    if (isEmptyState) {
      test.skip()
      return
    }

    await page.getByRole("button", { name: /calendar view/i }).click()
    // The BillsCalendar renders a grid of day columns (1-31)
    // Verify day 1 label is visible as a proxy
    await expect(page.getByText("1", { exact: true }).first()).toBeVisible()
  })

  test("summary bar shows Total Monthly Cost, Number of Bills", async ({ page }) => {
    const isEmptyState = await page
      .getByText(/no recurring bills yet/i)
      .isVisible()
      .catch(() => false)
    if (isEmptyState) {
      test.skip()
      return
    }

    await expect(page.getByText(/total monthly cost/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/number of bills/i)).toBeVisible()
  })
})
