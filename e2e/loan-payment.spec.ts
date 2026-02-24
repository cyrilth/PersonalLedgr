import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Loan Payment", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
  })

  test("loans page loads and shows summary metrics", async ({ page }) => {
    await page.goto("/loans")
    // The h1 appears both in the sticky banner and the page content — scope to main
    await expect(page.getByRole("main").getByRole("heading", { name: "Loans" })).toBeVisible()
    // With seeded data, summary metrics should appear
    await expect(page.getByText(/total debt/i)).toBeVisible({ timeout: 10_000 })
  })

  test("loan card links to the loan detail page", async ({ page }) => {
    await page.goto("/loans")

    // Wait for loan cards to render (skeleton resolves)
    const loanCard = page.locator("a[href^='/loans/']").first()
    const hasLoans = await loanCard.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!hasLoans) {
      // No loan accounts in seed data — skip gracefully
      test.skip()
      return
    }

    await loanCard.click()
    await expect(page).toHaveURL(/\/loans\/[^/]+/)
  })

  test("loan detail page shows amortization table and extra payment calculator", async ({
    page,
  }) => {
    await page.goto("/loans")

    const loanCard = page.locator("a[href^='/loans/']").first()
    const hasLoans = await loanCard.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!hasLoans) {
      test.skip()
      return
    }

    await loanCard.click()

    // Amortization table section heading
    await expect(
      page.getByRole("heading", { name: /amortization/i })
    ).toBeVisible({ timeout: 10_000 })

    // Extra payment calculator section
    await expect(
      page.getByRole("heading", { name: /extra payment/i })
    ).toBeVisible()
  })

  test("Loan Payment Form opens from the Add Transaction dialog", async ({
    page,
  }) => {
    await page.goto("/transactions")

    await page.getByRole("button", { name: /add transaction/i }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("tab", { name: /loan payment/i }).click()

    // If no loan accounts exist the form shows an informational message
    const noLoansMsg = dialog.getByText(/no loan accounts found/i)
    const openFormBtn = dialog.getByRole("button", { name: /open loan payment form/i })

    const hasNoLoans = await noLoansMsg.isVisible().catch(() => false)
    if (hasNoLoans) {
      // Expected when demo seed has no loans — just verify the message is shown
      await expect(noLoansMsg).toBeVisible()
      return
    }

    await expect(openFormBtn).toBeVisible()
    await openFormBtn.click()

    await expect(
      page.getByRole("heading", { name: /record loan payment/i })
    ).toBeVisible()
  })

  test("Loan Payment Form shows principal/interest breakdown preview", async ({
    page,
  }) => {
    await page.goto("/transactions")
    await page.getByRole("button", { name: /add transaction/i }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("tab", { name: /loan payment/i }).click()

    const openFormBtn = dialog.getByRole("button", { name: /open loan payment form/i })
    const hasOpenBtn = await openFormBtn.isVisible().catch(() => false)
    if (!hasOpenBtn) {
      test.skip()
      return
    }
    await openFormBtn.click()

    const loanDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: /record loan payment/i }),
    })

    // Select the first loan account to trigger the preview
    await loanDialog.getByLabel(/loan account/i).click()
    await page.getByRole("option").first().click()

    // Also select a source account
    await loanDialog.getByLabel(/from account/i).click()
    const fromOptions = page.getByRole("option")
    if ((await fromOptions.count()) > 0) {
      await fromOptions.first().click()
    }

    // The form auto-fills the monthly payment amount; the preview should appear
    await expect(
      loanDialog.getByText(/payment breakdown/i)
    ).toBeVisible({ timeout: 5_000 })
    // Use exact text match to avoid strict mode violation with /principal/i
    await expect(loanDialog.getByText("Principal", { exact: true })).toBeVisible()
    await expect(loanDialog.getByText("Interest", { exact: true })).toBeVisible()
  })
})
