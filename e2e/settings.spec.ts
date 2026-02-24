import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/settings")
  })

  test("settings page loads with heading", async ({ page }) => {
    // The h1 appears both in the sticky banner and the page content
    await expect(page.getByRole("main").getByRole("heading", { name: "Settings" })).toBeVisible()
  })

  test("Account & Profile section is visible with link to profile", async ({ page }) => {
    // Section titles are plain text nodes inside generic divs, not heading roles
    await expect(page.getByText("Account & Profile")).toBeVisible()
    await expect(page.getByRole("link", { name: /go to profile/i })).toBeVisible()
  })

  test("Appearance section shows theme toggle", async ({ page }) => {
    await expect(page.getByText("Appearance")).toBeVisible()
    // The settings section has its own Toggle theme button; scope to settings section
    // to avoid matching the sidebar toggle (strict mode)
    await expect(page.locator("#theme").getByRole("button", { name: /toggle theme/i })).toBeVisible()
  })

  test("Appearance section shows current theme label", async ({ page }) => {
    // The text "light mode" or "dark mode" appears as a <span> next to the toggle
    await expect(
      page.locator("span").filter({ hasText: /^(light|dark|system) mode$/ }).first()
    ).toBeVisible()
  })

  test("Categories section shows built-in categories", async ({ page }) => {
    // "Categories" appears in multiple elements; check the Built-in Categories heading specifically
    await expect(page.getByRole("heading", { name: "Built-in Categories" })).toBeVisible()
    // At least one category badge (Housing) should be present
    await expect(page.getByText("Housing")).toBeVisible()
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
    // DisclaimerContent renders substantial text; check for a known heading within it
    await expect(page.getByRole("heading", { name: /no financial advice/i })).toBeVisible()
  })

  test("Recalculate Balances section has a Check Balances button", async ({ page }) => {
    await expect(page.getByText("Recalculate Balances")).toBeVisible()
    await expect(
      page.getByRole("button", { name: /check balances/i })
    ).toBeVisible()
  })

  test("Seed Data section has Load Demo Data and Wipe All Data buttons", async ({
    page,
  }) => {
    await expect(page.getByText("Seed Data")).toBeVisible()
    await expect(
      page.getByRole("button", { name: /load demo data/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /wipe all data/i })
    ).toBeVisible()
  })

  test("Data Export section has Export JSON and Export CSV buttons", async ({ page }) => {
    await expect(page.getByText("Data Export")).toBeVisible()
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
