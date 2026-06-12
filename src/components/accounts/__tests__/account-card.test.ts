// @vitest-environment jsdom

import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { render, screen } from "@testing-library/react"
import { AccountCard, getUtilizationColor, getProgressColor } from "../account-card"

describe("getUtilizationColor", () => {
  it("returns green for < 30%", () => {
    expect(getUtilizationColor(0)).toBe("text-positive")
    expect(getUtilizationColor(29)).toBe("text-positive")
  })

  it("returns yellow for 30-69%", () => {
    expect(getUtilizationColor(30)).toBe("text-yellow-500")
    expect(getUtilizationColor(69)).toBe("text-yellow-500")
  })

  it("returns red for >= 70%", () => {
    expect(getUtilizationColor(70)).toBe("text-negative")
    expect(getUtilizationColor(100)).toBe("text-negative")
  })
})

describe("getProgressColor", () => {
  it("returns green for < 30%", () => {
    expect(getProgressColor(0)).toBe("[&>div]:bg-positive")
    expect(getProgressColor(29)).toBe("[&>div]:bg-positive")
  })

  it("returns yellow for 30-69%", () => {
    expect(getProgressColor(30)).toBe("[&>div]:bg-yellow-500")
    expect(getProgressColor(69)).toBe("[&>div]:bg-yellow-500")
  })

  it("returns red for >= 70%", () => {
    expect(getProgressColor(70)).toBe("[&>div]:bg-negative")
    expect(getProgressColor(100)).toBe("[&>div]:bg-negative")
  })
})

describe("AccountCard", () => {
  it("shows debt balances with their negative sign", () => {
    render(createElement(AccountCard, {
      id: "cc-1",
      name: "Visa Rewards",
      type: "CREDIT_CARD",
      balance: -350,
      creditLimit: 5000,
      owner: null,
    }))

    expect(screen.getByText("-$350.00")).toBeInTheDocument()
    expect(screen.getByText("$350.00 / $5,000.00")).toBeInTheDocument()
  })
})
