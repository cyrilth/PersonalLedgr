import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"
import os from "os"
import { login, acceptDisclaimer } from "./helpers"

/** Write a minimal CSV file to a temp path and return its absolute path. */
function writeTempCSV(content: string): string {
  const tmpFile = path.join(os.tmpdir(), `pl-test-${Date.now()}.csv`)
  fs.writeFileSync(tmpFile, content, "utf-8")
  return tmpFile
}

const SAMPLE_CSV = [
  "Date,Description,Amount",
  "2026-01-15,Grocery Store,-52.34",
  "2026-01-16,Paycheck,2500.00",
  "2026-01-17,Electric Bill,-120.00",
].join("\n")

test.describe("CSV Import", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await acceptDisclaimer(page)
    await page.goto("/import")
  })

  test("import page loads with step 1 (Upload) visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /csv import/i })).toBeVisible()
    // Step indicator shows the three wizard steps — use exact text to avoid strict mode
    await expect(page.getByText("Upload", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Map Columns")).toBeVisible()
    // Step 3 is "Review & Import"
    await expect(page.getByText("Review & Import")).toBeVisible()
  })

  test("Target Account section is shown on step 1", async ({ page }) => {
    // "Target Account" is a card title (generic element, not a heading role)
    await expect(page.getByText("Target Account")).toBeVisible()
    await expect(page.getByText(/select an account to import into/i)).toBeVisible()
  })

  test("Upload CSV File drop zone is visible", async ({ page }) => {
    // "Upload CSV File" is a card title (generic element, not a heading role)
    await expect(page.getByText("Upload CSV File")).toBeVisible()
    await expect(page.getByText(/drop your csv file here/i)).toBeVisible()
  })

  test("uploading a CSV file shows the preview table", async ({ page }) => {
    const csvPath = writeTempCSV(SAMPLE_CSV)

    // Use the hidden file input to upload
    const fileInput = page.locator('input[type="file"][accept=".csv"]')
    await fileInput.setInputFiles(csvPath)

    // Preview section should appear with the first 5 rows
    // The preview heading is also a card title (generic element)
    await expect(page.getByText(/preview/i).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText("Grocery Store")).toBeVisible()
    await expect(page.getByText("Paycheck")).toBeVisible()

    // Clean up temp file
    fs.unlinkSync(csvPath)
  })

  test("Continue to Column Mapping button appears after file upload and account selection", async ({
    page,
  }) => {
    const csvPath = writeTempCSV(SAMPLE_CSV)
    const fileInput = page.locator('input[type="file"][accept=".csv"]')
    await fileInput.setInputFiles(csvPath)

    // Wait for preview to confirm file was parsed
    await expect(page.getByText(/preview/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Select an account — scope to main to avoid the year combobox in the banner
    await page.getByRole("main").getByRole("combobox").first().click()
    const options = page.getByRole("option")
    const hasOptions = await options.first().isVisible().catch(() => false)
    if (!hasOptions) {
      fs.unlinkSync(csvPath)
      test.skip()
      return
    }
    await options.first().click()

    // "Continue to Column Mapping" button should appear
    await expect(
      page.getByRole("button", { name: /continue to column mapping/i })
    ).toBeVisible()

    fs.unlinkSync(csvPath)
  })

  test("advances to column mapping step after clicking Continue", async ({ page }) => {
    const csvPath = writeTempCSV(SAMPLE_CSV)
    const fileInput = page.locator('input[type="file"][accept=".csv"]')
    await fileInput.setInputFiles(csvPath)

    await expect(page.getByText(/preview/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Select an account — scope to main to avoid the year combobox in the banner
    await page.getByRole("main").getByRole("combobox").first().click()
    const options = page.getByRole("option")
    const hasOptions = await options.first().isVisible().catch(() => false)
    if (!hasOptions) {
      fs.unlinkSync(csvPath)
      test.skip()
      return
    }
    await options.first().click()

    await page.getByRole("button", { name: /continue to column mapping/i }).click()

    // Step 2: Column Mapper shows column selection dropdowns
    // The step heading is a text node (not a heading role) — check for a column combobox
    await expect(
      page.getByRole("combobox", { name: /date column/i })
    ).toBeVisible({ timeout: 10_000 })

    fs.unlinkSync(csvPath)
  })
})
