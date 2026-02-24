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
      page.getByRole("heading", { name: /recurring bills/i }).first()
    ).toBeVisible()
  })

  test("Add Bill button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add bill/i }).first()).toBeVisible()
  })

  test("view toggle (grid / calendar) is present", async ({ page }) => {
    // The view toggle uses tabs with roles "tab", named "Bills" and "Calendar"
    await expect(page.getByRole("tab", { name: /bills/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /calendar/i })).toBeVisible()
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

    await expect(dialog.getByLabel("Name")).toBeVisible()
    // Use spinbutton role for numeric inputs to avoid strict mode violation
    // with "Variable amount" also matching /amount/i
    await expect(dialog.getByRole("spinbutton", { name: /^amount$/i })).toBeVisible()
    await expect(dialog.getByLabel(/frequency/i)).toBeVisible()
    await expect(dialog.getByLabel(/day of month/i)).toBeVisible()
    await expect(dialog.getByLabel(/payment account/i)).toBeVisible()
  })

  test("creates a recurring bill and it appears in the list", async ({ page }) => {
    await page.getByRole("button", { name: /add bill/i }).first().click()
    const dialog = page.getByRole("dialog")

    const uniqueName = `E2E Bill ${Date.now()}`
    await dialog.getByLabel("Name").fill(uniqueName)
    // Use the Amount spinbutton specifically
    await dialog.getByRole("spinbutton", { name: /^amount$/i }).fill("75.00")
    await dialog.getByLabel(/day of month/i).fill("15")

    // Select a payment account — wait up to 3 s for the dropdown to open
    await dialog.getByLabel(/payment account/i).click()
    const options = page.getByRole("option")
    const hasOptions = await options.first()
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
    if (!hasOptions) {
      // No accounts available — press Escape to close any open dropdown then cancel
      await page.keyboard.press("Escape")
      await page.waitForTimeout(200)
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

    // Use the "Calendar" tab to switch view
    await page.getByRole("tab", { name: /calendar/i }).click()
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
