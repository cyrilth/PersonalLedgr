// @vitest-environment jsdom
/**
 * Tests for ColumnMapper component.
 *
 * Covers:
 * - Renders with "Single Amount Column" pattern selected by default
 * - Pattern toggle buttons for all 3 patterns
 * - Switching to "Separate Debit/Credit Columns" shows debit/credit selectors
 * - Switching to "Amount + Type Indicator" shows indicator column and debit values input
 * - Back button calls onBack
 * - Continue button disabled when mapping is incomplete
 * - Shows preview message when mapping is incomplete
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ColumnMapper } from "../column-mapper"
import type { DetectedColumns } from "@/actions/import"

// Mock the server action used for live preview
vi.mock("@/actions/import", () => ({
  normalizeAmounts: vi.fn().mockResolvedValue([]),
}))

const defaultHeaders = ["Date", "Description", "Amount", "Category"]

const defaultDetected: DetectedColumns = {
  dateColumn: 0,
  descriptionColumn: 1,
  categoryColumn: 3,
  amountPattern: {
    type: "single",
    amountColumn: 2,
  },
}

function renderMapper(overrides: Partial<Parameters<typeof ColumnMapper>[0]> = {}) {
  const props = {
    headers: defaultHeaders,
    sampleRows: [],
    detected: defaultDetected,
    onMappingConfirm: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  return render(<ColumnMapper {...props} />)
}

describe("ColumnMapper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the Map Columns title", () => {
    renderMapper()
    expect(screen.getByText("Map Columns")).toBeInTheDocument()
  })

  it("renders all three pattern buttons", () => {
    renderMapper()
    expect(screen.getByRole("button", { name: "Single Amount Column" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Separate Debit/Credit Columns" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Amount + Type Indicator" })).toBeInTheDocument()
  })

  it("shows Amount Column selector for single pattern by default", () => {
    renderMapper()
    // The label "Amount Column" is rendered for pattern 1
    expect(screen.getAllByText(/Amount Column/).length).toBeGreaterThan(0)
  })

  it("shows Debit and Credit column selectors after switching to separate pattern", () => {
    renderMapper()
    fireEvent.click(screen.getByRole("button", { name: "Separate Debit/Credit Columns" }))
    expect(screen.getByText("Debit Column")).toBeInTheDocument()
    expect(screen.getByText("Credit Column")).toBeInTheDocument()
  })

  it("hides Amount Column (single) selector after switching to separate pattern", () => {
    renderMapper()
    fireEvent.click(screen.getByRole("button", { name: "Separate Debit/Credit Columns" }))
    // After switching, the single Amount Column label should no longer appear in pattern section
    // (the common Amount field label disappears, only Debit/Credit show)
    expect(screen.queryByLabelText(/^Amount Column \*/)).not.toBeInTheDocument()
  })

  it("shows indicator column and debit values input for indicator pattern", () => {
    renderMapper()
    fireEvent.click(screen.getByRole("button", { name: "Amount + Type Indicator" }))
    expect(screen.getByText("Type Indicator Column")).toBeInTheDocument()
    // Label text includes an asterisk in a child span, so search by text content
    expect(screen.getByText(/Debit Indicator Values/)).toBeInTheDocument()
    // The input itself has id="debit-values"
    expect(document.getElementById("debit-values")).toBeInTheDocument()
  })

  it("shows default 'DR,DEBIT' value in debit indicator input for indicator pattern", () => {
    renderMapper({ detected: { ...defaultDetected, amountPattern: { type: "single", amountColumn: 2 } } })
    fireEvent.click(screen.getByRole("button", { name: "Amount + Type Indicator" }))
    const input = document.getElementById("debit-values") as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe("DR,DEBIT")
  })

  it("calls onBack when Back button is clicked", () => {
    const onBack = vi.fn()
    renderMapper({ onBack })
    fireEvent.click(screen.getByRole("button", { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("Continue button is enabled when a valid mapping exists (all required columns detected)", () => {
    renderMapper()
    // With defaultDetected having all required fields, Continue should be enabled
    const continueBtn = screen.getByRole("button", { name: /continue/i })
    expect(continueBtn).not.toBeDisabled()
  })

  it("Continue button is disabled when mapping is incomplete (no amount pattern)", () => {
    renderMapper({
      detected: {
        dateColumn: 0,
        descriptionColumn: 1,
        categoryColumn: null,
        amountPattern: null,
      },
    })
    const continueBtn = screen.getByRole("button", { name: /continue/i })
    expect(continueBtn).toBeDisabled()
  })

  it("shows preview instructions when mapping is incomplete", () => {
    renderMapper({
      detected: {
        dateColumn: null,
        descriptionColumn: null,
        categoryColumn: null,
        amountPattern: null,
      },
    })
    expect(screen.getByText(/select all required columns/i)).toBeInTheDocument()
  })

  it("calls onMappingConfirm with mapping when Continue is clicked and mapping is valid", () => {
    const onMappingConfirm = vi.fn()
    renderMapper({ onMappingConfirm })
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(onMappingConfirm).toHaveBeenCalledOnce()
    const mapping = onMappingConfirm.mock.calls[0][0]
    expect(mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountPattern: { type: "single", amountColumn: 2 },
    })
  })

  it("renders common column selectors: Date, Description, Category", () => {
    renderMapper()
    expect(screen.getByLabelText(/Date Column/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description Column/)).toBeInTheDocument()
    expect(screen.getByText("Category Column")).toBeInTheDocument()
  })
})
