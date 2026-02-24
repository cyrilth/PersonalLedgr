// @vitest-environment jsdom
/**
 * Tests for ImportPreview component.
 *
 * Covers:
 * - Summary stats (new, duplicate, review counts)
 * - "New", "Duplicate", "Review" badge rendering per row
 * - Select All / Deselect All callbacks
 * - onRowToggle called on checkbox interaction
 * - Import button disabled when no rows selected
 * - Import button shows selected count
 * - Back button calls onBack
 * - Importing state shows spinner
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ImportPreview } from "../import-preview"
import type { ImportRow } from "@/actions/import"

// Mock the import action type only; no server calls in this component
vi.mock("@/actions/import", () => ({}))

function makeRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    index: 0,
    date: "2026-01-15",
    description: "Grocery Store",
    amount: -50.0,
    category: null,
    status: "new",
    selected: true,
    matchDescription: undefined,
    ...overrides,
  }
}

const defaultProps = {
  onRowToggle: vi.fn(),
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
  onDismissReconcile: vi.fn(),
  onSelectCandidate: vi.fn(),
  onImport: vi.fn(),
  onBack: vi.fn(),
  importing: false,
}

describe("ImportPreview", () => {
  it("renders summary badge counts correctly", () => {
    const rows: ImportRow[] = [
      makeRow({ index: 0, status: "new", selected: true }),
      makeRow({ index: 1, status: "new", selected: true }),
      makeRow({ index: 2, status: "duplicate", selected: false }),
      makeRow({ index: 3, status: "review", selected: true }),
    ]
    render(<ImportPreview {...defaultProps} rows={rows} />)

    expect(screen.getByText(/2 New/)).toBeInTheDocument()
    expect(screen.getByText(/1 Duplicate/)).toBeInTheDocument()
    expect(screen.getByText(/1 Review/)).toBeInTheDocument()
  })

  it("renders selected count of total", () => {
    const rows: ImportRow[] = [
      makeRow({ index: 0, selected: true }),
      makeRow({ index: 1, selected: false }),
    ]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getByText(/1 of 2 selected for import/i)).toBeInTheDocument()
  })

  it("renders New badge for new-status rows", () => {
    const rows = [makeRow({ index: 0, status: "new", selected: true })]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    // "New" appears in summary AND row — look for multiple instances
    expect(screen.getAllByText("New").length).toBeGreaterThan(0)
  })

  it("renders Duplicate badge for duplicate-status rows", () => {
    const rows = [makeRow({ index: 0, status: "duplicate", selected: false })]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getAllByText("Duplicate").length).toBeGreaterThan(0)
  })

  it("renders Review badge for review-status rows", () => {
    const rows = [makeRow({ index: 0, status: "review", selected: true })]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)
  })

  it("shows match description for duplicate rows", () => {
    const rows = [
      makeRow({
        index: 0,
        status: "duplicate",
        selected: false,
        matchDescription: "Grocery Store - Existing",
      }),
    ]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getByText(/Matches: Grocery Store - Existing/)).toBeInTheDocument()
  })

  it("shows similar description for review rows", () => {
    const rows = [
      makeRow({
        index: 0,
        status: "review",
        selected: true,
        matchDescription: "Grocery Stor",
      }),
    ]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getByText(/Similar: Grocery Stor/)).toBeInTheDocument()
  })

  it("calls onSelectAll when 'Select All' is clicked", () => {
    const onSelectAll = vi.fn()
    render(<ImportPreview {...defaultProps} rows={[makeRow()]} onSelectAll={onSelectAll} />)
    fireEvent.click(screen.getByRole("button", { name: "Select All" }))
    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it("calls onDeselectAll when 'Deselect All' is clicked", () => {
    const onDeselectAll = vi.fn()
    render(<ImportPreview {...defaultProps} rows={[makeRow()]} onDeselectAll={onDeselectAll} />)
    fireEvent.click(screen.getByRole("button", { name: "Deselect All" }))
    expect(onDeselectAll).toHaveBeenCalledOnce()
  })

  it("calls onBack when Back button is clicked", () => {
    const onBack = vi.fn()
    render(<ImportPreview {...defaultProps} rows={[makeRow()]} onBack={onBack} />)
    fireEvent.click(screen.getByRole("button", { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("disables Import button when no rows selected", () => {
    const rows = [makeRow({ index: 0, selected: false })]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    const importBtn = screen.getByRole("button", { name: /import/i })
    expect(importBtn).toBeDisabled()
  })

  it("shows selected count in Import button label", () => {
    const rows = [
      makeRow({ index: 0, selected: true }),
      makeRow({ index: 1, selected: true, description: "Gas Station" }),
    ]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getByRole("button", { name: /import 2 transactions/i })).toBeInTheDocument()
  })

  it("shows singular 'Transaction' when exactly 1 selected", () => {
    const rows = [makeRow({ index: 0, selected: true })]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getByRole("button", { name: /import 1 transaction$/i })).toBeInTheDocument()
  })

  it("shows 'Importing...' text when importing=true", () => {
    const rows = [makeRow({ index: 0, selected: true })]
    render(<ImportPreview {...defaultProps} rows={rows} importing={true} />)
    expect(screen.getByText("Importing...")).toBeInTheDocument()
  })

  it("disables Back button when importing", () => {
    const rows = [makeRow({ index: 0, selected: true })]
    render(<ImportPreview {...defaultProps} rows={rows} importing={true} />)
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled()
  })

  it("calls onRowToggle when a row checkbox is toggled", () => {
    const onRowToggle = vi.fn()
    const rows = [makeRow({ index: 5, selected: true })]
    render(<ImportPreview {...defaultProps} rows={rows} onRowToggle={onRowToggle} />)
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0])
    expect(onRowToggle).toHaveBeenCalledWith(5)
  })

  it("renders transaction description in the table", () => {
    const rows = [makeRow({ index: 0, description: "Amazon Prime" })]
    render(<ImportPreview {...defaultProps} rows={rows} />)
    expect(screen.getByText("Amazon Prime")).toBeInTheDocument()
  })
})
