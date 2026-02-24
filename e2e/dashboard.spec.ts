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
    // The IncomeExpenseChart renders a card title as a generic element (not a heading)
    await expect(page.getByText("Income vs Expenses")).toBeVisible()
  })

  test("recent transactions section is visible", async ({ page }) => {
    // RecentTransactions renders a text label (not a heading role)
    await expect(page.getByText("Recent Transactions")).toBeVisible()
  })

  test("upcoming bills widget is visible", async ({ page }) => {
    await expect(page.getByText("Upcoming Bills")).toBeVisible()
  })

  test("credit utilization widget is visible", async ({ page }) => {
    await expect(page.getByText("Credit Utilization")).toBeVisible()
  })

  test("sidebar navigation links are present", async ({ page }) => {
    const nav = page.getByRole("navigation")
    await expect(nav.getByRole("link", { name: /transactions/i })).toBeVisible()
    await expect(nav.getByRole("link", { name: /budgets/i })).toBeVisible()
    await expect(nav.getByRole("link", { name: /recurring/i })).toBeVisible()
  })
})
