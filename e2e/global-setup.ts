import { chromium, type FullConfig } from "@playwright/test"

const DISCLAIMER_KEY = "personalledgr-disclaimer-accepted"

/**
 * Global setup: authenticates the demo user once and saves the browser storage
 * state (auth cookies + localStorage) to a file.  All tests that use the
 * "auth" storageState project will reuse this saved session, avoiding repeated
 * logins that trigger Better Auth rate limiting.
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000"

  const browser = await chromium.launch()
  const context = await browser.newContext()

  // Pre-set the disclaimer key so the modal never blocks the login page.
  await context.addInitScript(({ key }: { key: string }) => {
    localStorage.setItem(key, "true")
  }, { key: DISCLAIMER_KEY })

  const page = await context.newPage()
  await page.goto(`${baseURL}/login`)

  // Fill and submit credentials
  await page.getByLabel("Email").fill("demo@personalledgr.local")
  await page.getByLabel("Password").fill("testpassword123")
  await page.getByRole("button", { name: /sign in|log in/i }).click()

  // Wait until the app redirects to the dashboard
  await page.waitForURL(`${baseURL}/`, { timeout: 30_000 })

  // Persist the disclaimer key in the resulting storage state
  await page.evaluate((key: string) => {
    localStorage.setItem(key, "true")
  }, DISCLAIMER_KEY)

  // Save storage state (cookies + localStorage) for reuse in all tests
  await context.storageState({ path: "e2e/.auth/user.json" })

  await browser.close()
}

export default globalSetup
