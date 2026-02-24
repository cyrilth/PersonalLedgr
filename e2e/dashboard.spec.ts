import { test, expect } from "@playwright/test"
import { login, acceptDisclaimer } from "./helpers"

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
  })

  test("loads and shows the page heading area", async ({ page }) => {
    // The dashboard is the root route — verify we are on it
    await expect(page).toHaveURL("/")
  })

  test("net worth widget is visible with assets and liabilities", async ({ page }) => {
    // Wait for skeletons to resolve into real content
    await expect(page.getByText("Net Worth")).toBeVisible()
    await expect(page.getByText("Assets")).toBeVisible()
    await expect(page.getByText("Liabilities")).toBeVisible()
    await expect(page.getByText("vs last month")).toBeVisible()
  })

  test("income vs expense chart card is visible", async ({ page }) => {
    // The IncomeExpenseChart renders a card with this heading
    await expect(
      page.getByRole("heading", { name: /income.*expense|income vs expense/i })
    ).toBeVisible()
  })

  test("recent transactions section is visible", async ({ page }) => {
    // RecentTransactions renders a heading
    await expect(
      page.getByRole("heading", { name: /recent transactions/i })
    ).toBeVisible()
  })

  test("upcoming bills widget is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /upcoming bills/i })
    ).toBeVisible()
  })

  test("credit utilization widget is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /credit utilization/i })
    ).toBeVisible()
  })

  test("sidebar navigation links are present", async ({ page }) => {
    await expect(page.getByRole("link", { name: /transactions/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /budgets/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /recurring/i })).toBeVisible()
  })
})
