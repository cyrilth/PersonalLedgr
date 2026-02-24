import { type Page } from "@playwright/test"

const DISCLAIMER_KEY = "personalledgr-disclaimer-accepted"

/**
 * Navigate to the dashboard as the authenticated demo user.
 *
 * The browser context already has the session cookies injected via
 * storageState (set in playwright.config.ts → globalSetup).  This helper
 * simply navigates to "/" and waits for the URL to settle there.
 *
 * We also ensure the disclaimer localStorage key is set so the modal never
 * blocks any page.  The global setup persists this key in the saved storage
 * state, but addInitScript is kept here as a belt-and-suspenders guarantee
 * for any context that might reload to a fresh page.
 */
export async function login(page: Page) {
  await page.addInitScript(
    ({ key }: { key: string }) => {
      localStorage.setItem(key, "true")
    },
    { key: DISCLAIMER_KEY }
  )
  await page.goto("/")
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
