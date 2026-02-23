import { describe, it, expect } from "vitest"
import { getUtilizationColor, getProgressColor } from "../account-card"

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
