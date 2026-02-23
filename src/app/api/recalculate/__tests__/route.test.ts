import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the account actions
vi.mock("@/actions/accounts", () => ({
  recalculateBalance: vi.fn(),
  confirmRecalculate: vi.fn(),
  recalculateAllBalances: vi.fn(),
  confirmRecalculateAll: vi.fn(),
}))

// Mock next/headers (required by server actions)
vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Map()),
}))

import {
  recalculateBalance,
  confirmRecalculate,
  recalculateAllBalances,
  confirmRecalculateAll,
} from "@/actions/accounts"
import { POST } from "../route"

function makeRequest(body: Record<string, unknown>) {
  return {
    json: () => Promise.resolve(body),
  } as unknown as Request & { json: () => Promise<Record<string, unknown>> }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/recalculate", () => {
  it("calls recalculateAllBalances when { all: true }", async () => {
    const mockResults = [{ accountId: "1", drift: 0 }]
    vi.mocked(recalculateAllBalances).mockResolvedValue(mockResults as never)

    const res = await POST(makeRequest({ all: true }) as never)
    const json = await res.json()

    expect(recalculateAllBalances).toHaveBeenCalledOnce()
    expect(json.results).toEqual(mockResults)
  })

  it("calls confirmRecalculateAll when { all: true, confirm: true }", async () => {
    const mockResults = [{ accountId: "1", balance: 100, corrected: true }]
    vi.mocked(confirmRecalculateAll).mockResolvedValue(mockResults)

    const res = await POST(makeRequest({ all: true, confirm: true }) as never)
    const json = await res.json()

    expect(confirmRecalculateAll).toHaveBeenCalledOnce()
    expect(json.results).toEqual(mockResults)
  })

  it("calls recalculateBalance when { accountId }", async () => {
    const mockResult = { stored: 100, calculated: 105, drift: 5 }
    vi.mocked(recalculateBalance).mockResolvedValue(mockResult)

    const res = await POST(makeRequest({ accountId: "abc" }) as never)
    const json = await res.json()

    expect(recalculateBalance).toHaveBeenCalledWith("abc")
    expect(json.result).toEqual(mockResult)
  })

  it("calls confirmRecalculate when { accountId, confirm: true }", async () => {
    const mockResult = { balance: 105 }
    vi.mocked(confirmRecalculate).mockResolvedValue(mockResult)

    const res = await POST(makeRequest({ accountId: "abc", confirm: true }) as never)
    const json = await res.json()

    expect(confirmRecalculate).toHaveBeenCalledWith("abc")
    expect(json.result).toEqual(mockResult)
  })

  it("returns 400 for empty body", async () => {
    const res = await POST(makeRequest({}) as never)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })

  it("returns 500 when action throws", async () => {
    vi.mocked(recalculateBalance).mockRejectedValue(new Error("DB error"))

    const res = await POST(makeRequest({ accountId: "abc" }) as never)

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe("DB error")
  })
})
