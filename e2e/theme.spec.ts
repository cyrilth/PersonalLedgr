import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Theme Toggle (dark / light mode)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
  })

  test("html element starts with a known theme class", async ({ page }) => {
    // next-themes sets either class="dark" or class="light" (or neither for system)
    const htmlClass = await page.locator("html").getAttribute("class")
    // Should contain "dark" or "light" or be falsy (system default)
    const isKnownTheme =
      htmlClass === null ||
      htmlClass === "" ||
      htmlClass.includes("dark") ||
      htmlClass.includes("light")
    expect(isKnownTheme).toBe(true)
  })

  test("clicking the theme toggle changes the theme class on the html element", async ({
    page,
  }) => {
    // Read the initial class
    const before = await page.locator("html").getAttribute("class")
    const wasDark = (before ?? "").includes("dark")

    // Click the sidebar toggle button (sr-only text: "Toggle theme")
    await page.getByRole("complementary").getByRole("button", { name: /toggle theme/i }).click()

    // Allow next-themes to apply the transition
    await page.waitForTimeout(300)

    const after = await page.locator("html").getAttribute("class")
    const isDarkNow = (after ?? "").includes("dark")

    // The theme should have flipped
    expect(isDarkNow).toBe(!wasDark)
  })

  test("toggling theme twice returns to the original theme", async ({ page }) => {
    const before = await page.locator("html").getAttribute("class")

    const toggleBtn = page.getByRole("complementary").getByRole("button", { name: /toggle theme/i })
    await toggleBtn.click()
    await page.waitForTimeout(300)
    await toggleBtn.click()
    await page.waitForTimeout(300)

    const after = await page.locator("html").getAttribute("class")

    // Normalise: treat null/"" as the same as "light"
    const normalise = (cls: string | null) =>
      (cls ?? "").includes("dark") ? "dark" : "light"
    expect(normalise(after)).toBe(normalise(before))
  })

  test("theme preference is preserved after page reload", async ({ page }) => {
    // The app uses storageKey="personalledgr-theme" in its ThemeProvider
    const THEME_KEY = "personalledgr-theme"

    // Force dark mode — set the key before page hydrates using addInitScript
    await page.addInitScript((key) => {
      localStorage.setItem(key, "dark")
    }, THEME_KEY)
    await page.reload()

    // next-themes reads from localStorage and applies the class
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 5_000 })

    // Force light mode — update the key and add a new init script for the reload
    await page.evaluate((key) => {
      localStorage.setItem(key, "light")
    }, THEME_KEY)
    await page.addInitScript((key) => {
      localStorage.setItem(key, "light")
    }, THEME_KEY)
    await page.reload()

    await expect(page.locator("html")).not.toHaveClass(/dark/, { timeout: 5_000 })
  })

  test("theme toggle is accessible from the Settings page", async ({ page }) => {
    await page.goto("/settings")
    // The settings section has an id="theme" anchor; scope to it to avoid the sidebar toggle
    await expect(
      page.locator("#theme").getByRole("button", { name: /toggle theme/i })
    ).toBeVisible()
  })
})
