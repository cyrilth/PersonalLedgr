import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Tithing Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/settings")
    // Wait for tithing settings to load (switch becomes enabled)
    const toggle = page.getByRole("switch", { name: /enable tithing tracking/i })
    await expect(toggle).toBeEnabled({ timeout: 10_000 })
  })

  test("tithing section is visible with toggle switch", async ({ page }) => {
    const section = page.locator("#tithing")
    await expect(section.getByText("Tithing", { exact: true })).toBeVisible()
    await expect(section.getByText("Track estimated vs actual tithing")).toBeVisible()
    await expect(page.getByRole("switch", { name: /enable tithing tracking/i })).toBeVisible()
  })

  test("enabling tithing reveals configuration fields", async ({ page }) => {
    const section = page.locator("#tithing")
    const toggle = page.getByRole("switch", { name: /enable tithing tracking/i })

    // Ensure disabled first
    if (await toggle.isChecked()) {
      await toggle.click()
    }

    // Percentage field should not be visible when disabled
    await expect(section.getByRole("spinbutton", { name: /percentage/i })).not.toBeVisible()

    // Enable
    await toggle.click()

    await expect(section.getByRole("spinbutton", { name: /percentage/i })).toBeVisible()
    await expect(section.getByRole("spinbutton", { name: /extra monthly/i })).toBeVisible()
    await expect(section.getByRole("textbox", { name: /category name/i })).toBeVisible()
  })

  test("can save tithing settings and they persist", async ({ page }) => {
    const section = page.locator("#tithing")
    const toggle = page.getByRole("switch", { name: /enable tithing tracking/i })
    if (!(await toggle.isChecked())) {
      await toggle.click()
    }

    await section.getByRole("spinbutton", { name: /percentage/i }).fill("15")
    await section.getByRole("spinbutton", { name: /extra monthly/i }).fill("200")
    await section.getByRole("textbox", { name: /category name/i }).fill("Church Tithe")

    await section.getByRole("button", { name: /save/i }).click()
    await expect(page.getByText(/tithing settings saved/i)).toBeVisible({ timeout: 10_000 })

    // Reload and wait for settings to load
    await page.reload()
    await expect(page.getByRole("switch", { name: /enable tithing tracking/i })).toBeEnabled({ timeout: 10_000 })

    // Wait for fields to appear (useEffect loads saved state asynchronously)
    const pctInput = section.getByRole("spinbutton", { name: /percentage/i })
    await expect(pctInput).toBeVisible({ timeout: 10_000 })

    // Verify values persisted
    await expect(pctInput).toHaveValue("15")
    await expect(section.getByRole("spinbutton", { name: /extra monthly/i })).toHaveValue("200")
    await expect(section.getByRole("textbox", { name: /category name/i })).toHaveValue("Church Tithe")
  })

  test("disabling tithing hides configuration fields", async ({ page }) => {
    const section = page.locator("#tithing")
    const toggle = page.getByRole("switch", { name: /enable tithing tracking/i })

    // Ensure enabled first
    if (!(await toggle.isChecked())) {
      await toggle.click()
    }
    await expect(section.getByRole("spinbutton", { name: /percentage/i })).toBeVisible()

    // Now disable
    await toggle.click()
    await expect(section.getByRole("spinbutton", { name: /percentage/i })).not.toBeVisible()
  })
})

test.describe("Tithing Dashboard Widget", () => {
  test.describe.configure({ mode: "serial" })

  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
  })

  test("tithing widget appears when enabled and hides when disabled", async ({ page }) => {
    // Step 1: Enable tithing in settings
    await page.goto("/settings")
    const toggle = page.getByRole("switch", { name: /enable tithing tracking/i })
    await expect(toggle).toBeEnabled({ timeout: 10_000 })

    if (!(await toggle.isChecked())) {
      await toggle.click()
    }
    await page.locator("#tithing").getByRole("button", { name: /save/i }).click()
    await expect(page.getByText(/tithing settings saved/i)).toBeVisible({ timeout: 10_000 })

    // Go to dashboard and verify tithing card is visible
    await page.goto("/")
    await expect(page.getByText("Net Worth")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("YTD Estimated")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("YTD Actual")).toBeVisible()

    // Step 2: Disable tithing in settings
    await page.goto("/settings")
    const toggle2 = page.getByRole("switch", { name: /enable tithing tracking/i })
    await expect(toggle2).toBeEnabled({ timeout: 10_000 })

    if (await toggle2.isChecked()) {
      await toggle2.click()
    }
    await page.locator("#tithing").getByRole("button", { name: /save/i }).click()
    await expect(page.getByText(/tithing settings saved/i)).toBeVisible({ timeout: 10_000 })

    // Go to dashboard and verify tithing card is NOT visible
    await page.goto("/")
    await expect(page.getByText("Net Worth")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("YTD Estimated")).not.toBeVisible()
  })
})
