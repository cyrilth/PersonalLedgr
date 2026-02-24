// Test setup file
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// Automatically cleanup after each test to avoid state leaking between tests
afterEach(() => {
  cleanup()
})

// Polyfill ResizeObserver (used by Radix UI Switch, Tooltip, and other components)
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Polyfill PointerEvent (used by Radix UI interactive components)
if (typeof window !== "undefined" && !window.PointerEvent) {
  // @ts-expect-error - minimal polyfill for jsdom
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
    }
  }
}
