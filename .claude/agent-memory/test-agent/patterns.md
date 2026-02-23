# Test Patterns

## Server Action Mock Setup (confirmed working)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mocks must be hoisted before imports
vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Map()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("@/db", () => {
  const txClient = {
    transaction: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    account: { update: vi.fn() },
  }
  return {
    prisma: {
      account: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      transaction: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn((fn) => fn(txClient)),
      _txClient: txClient,  // expose for assertions
    },
  }
})

// Then imports after mocks
import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import { myAction } from "../my-action"

const mockGetSession = vi.mocked(auth.api.getSession)
const txClient = (prisma as any)._txClient

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: "user-1" } } as never)
})
```

## Prisma Decimal mock helper
```typescript
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}
```

## Auth guard test pattern
```typescript
it("throws Unauthorized when no session", async () => {
  mockGetSession.mockResolvedValue(null as never)
  await expect(myAction()).rejects.toThrow("Unauthorized")
})
```

## Asserting $transaction inner calls
The `_txClient` trick lets you spy on what happens inside `prisma.$transaction(async (tx) => ...)`:
```typescript
// In test:
expect(txClient.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({...}) })
expect(txClient.account.update).toHaveBeenCalledWith({ where: { id: "acc-1" }, data: { balance: { increment: 50 } } })
```
