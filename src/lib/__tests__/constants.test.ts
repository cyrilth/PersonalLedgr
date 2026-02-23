import { describe, it, expect } from "vitest"
import {
  TRANSACTION_TYPES,
  ACCOUNT_TYPES,
  LOAN_TYPES,
  APR_RATE_TYPES,
  TRANSACTION_SOURCES,
  RECURRING_FREQUENCIES,
  TRANSACTION_TYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  LOAN_TYPE_LABELS,
  APR_RATE_TYPE_LABELS,
  TRANSACTION_SOURCE_LABELS,
  RECURRING_FREQUENCY_LABELS,
} from "@/lib/constants"

describe("label maps completeness", () => {
  it("TRANSACTION_TYPE_LABELS covers all transaction types", () => {
    for (const key of Object.values(TRANSACTION_TYPES)) {
      expect(TRANSACTION_TYPE_LABELS[key]).toBeDefined()
      expect(TRANSACTION_TYPE_LABELS[key].length).toBeGreaterThan(0)
    }
  })

  it("ACCOUNT_TYPE_LABELS covers all account types", () => {
    for (const key of Object.values(ACCOUNT_TYPES)) {
      expect(ACCOUNT_TYPE_LABELS[key]).toBeDefined()
      expect(ACCOUNT_TYPE_LABELS[key].length).toBeGreaterThan(0)
    }
  })

  it("LOAN_TYPE_LABELS covers all loan types", () => {
    for (const key of Object.values(LOAN_TYPES)) {
      expect(LOAN_TYPE_LABELS[key]).toBeDefined()
      expect(LOAN_TYPE_LABELS[key].length).toBeGreaterThan(0)
    }
  })

  it("APR_RATE_TYPE_LABELS covers all APR rate types", () => {
    for (const key of Object.values(APR_RATE_TYPES)) {
      expect(APR_RATE_TYPE_LABELS[key]).toBeDefined()
      expect(APR_RATE_TYPE_LABELS[key].length).toBeGreaterThan(0)
    }
  })

  it("TRANSACTION_SOURCE_LABELS covers all sources", () => {
    for (const key of Object.values(TRANSACTION_SOURCES)) {
      expect(TRANSACTION_SOURCE_LABELS[key]).toBeDefined()
      expect(TRANSACTION_SOURCE_LABELS[key].length).toBeGreaterThan(0)
    }
  })

  it("RECURRING_FREQUENCY_LABELS covers all frequencies", () => {
    for (const key of Object.values(RECURRING_FREQUENCIES)) {
      expect(RECURRING_FREQUENCY_LABELS[key]).toBeDefined()
      expect(RECURRING_FREQUENCY_LABELS[key].length).toBeGreaterThan(0)
    }
  })
})
