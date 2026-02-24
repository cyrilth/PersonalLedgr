// @vitest-environment jsdom
/**
 * Tests for DisclaimerModal component.
 *
 * Covers:
 * - Shows modal when localStorage key is absent
 * - Does NOT show modal when localStorage has "true"
 * - Acceptance button sets localStorage and hides the modal
 * - Modal cannot be closed without clicking the accept button (no close button)
 * - "I understand and accept" button is present when modal is shown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { DisclaimerModal } from "../disclaimer-modal"

// Mock the DisclaimerContent to keep the test focused
vi.mock("@/components/disclaimer-content", () => ({
  DisclaimerContent: () => <div data-testid="disclaimer-content">Disclaimer text here</div>,
}))

// Mock ScrollArea to render children directly (avoids resize observer issues)
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}))

const STORAGE_KEY = "personalledgr-disclaimer-accepted"

describe("DisclaimerModal", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("shows the modal when localStorage key is absent", () => {
    render(<DisclaimerModal />)
    expect(screen.getByText("Disclaimer")).toBeInTheDocument()
  })

  it("shows the disclaimer content when modal is open", () => {
    render(<DisclaimerModal />)
    expect(screen.getByTestId("disclaimer-content")).toBeInTheDocument()
  })

  it("shows 'I understand and accept' button", () => {
    render(<DisclaimerModal />)
    expect(
      screen.getByRole("button", { name: /I understand and accept/i })
    ).toBeInTheDocument()
  })

  it("does not show a close/dismiss button (modal is blocking)", () => {
    render(<DisclaimerModal />)
    // There should be no X or cancel button — only the accept button
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it("does NOT show modal when localStorage already has 'true'", () => {
    localStorage.setItem(STORAGE_KEY, "true")
    render(<DisclaimerModal />)
    expect(screen.queryByText("Disclaimer")).not.toBeInTheDocument()
  })

  it("hides modal and stores acceptance after clicking accept button", async () => {
    render(<DisclaimerModal />)
    const acceptBtn = screen.getByRole("button", { name: /I understand and accept/i })
    fireEvent.click(acceptBtn)

    await waitFor(() => {
      expect(screen.queryByText("Disclaimer")).not.toBeInTheDocument()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe("true")
  })

  it("does not show modal when localStorage value is 'true' on re-render", () => {
    // Simulate returning to app after prior acceptance
    localStorage.setItem(STORAGE_KEY, "true")
    const { container } = render(<DisclaimerModal />)
    // The fixed overlay div should not be rendered
    expect(container.querySelector(".fixed")).not.toBeInTheDocument()
  })

  it("renders modal with a fixed overlay", () => {
    const { container } = render(<DisclaimerModal />)
    expect(container.querySelector(".fixed")).toBeInTheDocument()
  })

  it("renders the scroll area for disclaimer content", () => {
    render(<DisclaimerModal />)
    expect(screen.getByTestId("scroll-area")).toBeInTheDocument()
  })
})
