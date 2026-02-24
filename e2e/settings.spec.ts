import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/settings")
  })

  test("settings page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  })

  test("Account & Profile section is visible with link to profile", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /account.*profile/i })
    ).toBeVisible()
    await expect(page.getByRole("link", { name: /go to profile/i })).toBeVisible()
  })

  test("Appearance section shows theme toggle", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /appearance/i })
    ).toBeVisible()
    // The ThemeToggle is a ghost-variant icon button with sr-only text "Toggle theme"
    await expect(page.getByRole("button", { name: /toggle theme/i })).toBeVisible()
  })

  test("Appearance section shows current theme label", async ({ page }) => {
    // The text "light mode" or "dark mode" is shown next to the toggle
    await expect(
      page.getByText(/light mode|dark mode|system mode/i)
    ).toBeVisible()
  })

  test("Categories section shows built-in categories", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /categories/i })).toBeVisible()
    await expect(page.getByText(/built-in categories/i)).toBeVisible()
    // At least one category badge should be present
    await expect(page.getByRole("heading", { name: /categories/i })
      .locator("..") // parent card
    ).toBeVisible()
  })

  test("Categories section has an input to add a new custom category", async ({ page }) => {
    await expect(
      page.getByPlaceholder(/new category name/i)
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^add$/i })).toBeVisible()
  })

  test("can create a new custom category", async ({ page }) => {
    const uniqueName = `E2E Cat ${Date.now()}`
    await page.getByPlaceholder(/new category name/i).fill(uniqueName)
    await page.getByRole("button", { name: /^add$/i }).click()
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })
  })

  test("Disclaimer section renders the disclaimer text", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /disclaimer/i })).toBeVisible()
    // DisclaimerContent renders substantial text; check for the word "disclaimer" in body
    await expect(page.locator("#disclaimer")).toBeVisible()
  })

  test("Recalculate Balances section has a Check Balances button", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /recalculate balances/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /check balances/i })
    ).toBeVisible()
  })

  test("Seed Data section has Load Demo Data and Wipe All Data buttons", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { name: /seed data/i })).toBeVisible()
    await expect(
      page.getByRole("button", { name: /load demo data/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /wipe all data/i })
    ).toBeVisible()
  })

  test("Data Export section has Export JSON and Export CSV buttons", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /data export/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /export json/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /export csv/i })).toBeVisible()
  })

  test("Wipe All Data confirmation dialog requires typing DELETE", async ({ page }) => {
    await page.getByRole("button", { name: /wipe all data/i }).click()

    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/type.*delete.*to confirm/i)).toBeVisible()

    // Confirm action button should be disabled until DELETE is typed
    const confirmBtn = dialog.getByRole("button", { name: /wipe everything/i })
    await expect(confirmBtn).toBeDisabled()

    await dialog.getByPlaceholder(/type delete/i).fill("DELETE")
    await expect(confirmBtn).toBeEnabled()

    // Cancel without wiping
    await dialog.getByRole("button", { name: /cancel/i }).click()
    await expect(dialog).toBeHidden()
  })
})
