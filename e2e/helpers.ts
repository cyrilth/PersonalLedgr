import { type Page } from "@playwright/test"

/**
 * Log in with the demo account and wait for the dashboard to load.
 * Call this at the start of any test that requires an authenticated session.
 */
export async function login(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email").fill("demo@personalledgr.local")
  await page.getByLabel("Password").fill("testpassword123")
  await page.getByRole("button", { name: /sign in|log in/i }).click()
  await page.waitForURL("/")
}

/**
 * Accept the first-launch disclaimer modal if it is present.
 * Clicks "I understand and accept" and waits for the overlay to disappear.
 */
export async function acceptDisclaimer(page: Page) {
  const acceptBtn = page.getByRole("button", { name: /i understand and accept/i })
  if (await acceptBtn.isVisible()) {
    await acceptBtn.click()
    await acceptBtn.waitFor({ state: "hidden" })
  }
}
