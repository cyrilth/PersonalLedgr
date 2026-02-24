import { test, expect } from "@playwright/test"

/**
 * Disclaimer modal tests.
 *
 * The modal is driven by the localStorage key "personalledgr-disclaimer-accepted".
 * Clearing storage before navigating triggers the first-launch experience.
 * These tests do NOT call login() so they can observe the modal on the login page
 * itself (the modal is rendered in the root layout, which wraps all pages).
 */

const STORAGE_KEY = "personalledgr-disclaimer-accepted"

test.describe("Disclaimer modal", () => {
  test("shows the disclaimer modal when localStorage key is absent", async ({ page }) => {
    // Ensure the key does not exist before navigating
    await page.addInitScript((key) => {
      localStorage.removeItem(key)
    }, STORAGE_KEY)

    await page.goto("/login")

    // The modal overlay should be visible
    await expect(
      page.getByRole("heading", { name: /disclaimer/i })
    ).toBeVisible({ timeout: 10_000 })

    // The accept button should be present
    await expect(
      page.getByRole("button", { name: /i understand and accept/i })
    ).toBeVisible()
  })

  test("modal cannot be dismissed by clicking the backdrop — only the accept button works", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      localStorage.removeItem(key)
    }, STORAGE_KEY)

    await page.goto("/login")

    // Attempt to press Escape (the modal has no close button and ignores backdrop clicks)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(300)

    // Modal should still be visible
    await expect(
      page.getByRole("heading", { name: /disclaimer/i })
    ).toBeVisible()
  })

  test("clicking 'I understand and accept' dismisses the modal", async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.removeItem(key)
    }, STORAGE_KEY)

    await page.goto("/login")

    await page
      .getByRole("button", { name: /i understand and accept/i })
      .click()

    // The overlay should disappear
    await expect(
      page.getByRole("heading", { name: /disclaimer/i })
    ).toBeHidden({ timeout: 5_000 })
  })

  test("accepting the disclaimer persists the key in localStorage", async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.removeItem(key)
    }, STORAGE_KEY)

    await page.goto("/login")
    await page.getByRole("button", { name: /i understand and accept/i }).click()

    // Wait for the modal to close before reading localStorage
    await expect(
      page.getByRole("button", { name: /i understand and accept/i })
    ).toBeHidden({ timeout: 5_000 })

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY
    )
    expect(stored).toBe("true")
  })

  test("modal does not reappear after acceptance and page reload", async ({ page }) => {
    // Use a session flag so addInitScript only removes the key on the FIRST navigation.
    // Without this guard, addInitScript re-fires on page.reload() and wipes the
    // accepted state that the user just set.
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem("__pl_test_disclaimer_cleared__")) {
        sessionStorage.setItem("__pl_test_disclaimer_cleared__", "1")
        localStorage.removeItem(key)
      }
    }, STORAGE_KEY)

    await page.goto("/login")
    await page.getByRole("button", { name: /i understand and accept/i }).click()

    // Wait for dismiss, then reload
    await expect(
      page.getByRole("button", { name: /i understand and accept/i })
    ).toBeHidden({ timeout: 5_000 })

    await page.reload()

    // Modal should NOT be shown on the second visit
    await expect(
      page.getByRole("button", { name: /i understand and accept/i })
    ).toBeHidden({ timeout: 3_000 })
  })

  test("modal reappears when localStorage key is cleared", async ({ page }) => {
    // First visit — accept the disclaimer
    await page.addInitScript((key) => {
      localStorage.removeItem(key)
    }, STORAGE_KEY)

    await page.goto("/login")
    await page.getByRole("button", { name: /i understand and accept/i }).click()
    await expect(
      page.getByRole("button", { name: /i understand and accept/i })
    ).toBeHidden({ timeout: 5_000 })

    // Clear the key programmatically and navigate again
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.goto("/login")

    // Modal should reappear
    await expect(
      page.getByRole("heading", { name: /disclaimer/i })
    ).toBeVisible({ timeout: 5_000 })
  })
})
