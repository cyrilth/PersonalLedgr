/**
 * API route for balance recalculation.
 *
 * Compares stored account balances against the sum of their transactions
 * and optionally applies corrections. Supports single-account and bulk modes.
 *
 * POST body variants:
 * - { accountId: string }                → check drift for one account
 * - { accountId: string, confirm: true } → apply correction for one account
 * - { all: true }                        → check drift for all active accounts
 * - { all: true, confirm: true }         → apply corrections for all accounts with drift
 */

import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  recalculateBalance,
  confirmRecalculate,
  recalculateAllBalances,
  confirmRecalculateAll,
} from "@/actions/accounts"

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()

    if (body.all) {
      if (body.confirm) {
        const results = await confirmRecalculateAll()
        return NextResponse.json({ results })
      }
      const results = await recalculateAllBalances()
      return NextResponse.json({ results })
    }

    if (body.accountId) {
      if (body.confirm) {
        const result = await confirmRecalculate(body.accountId)
        return NextResponse.json({ result })
      }
      const result = await recalculateBalance(body.accountId)
      return NextResponse.json({ result })
    }

    return NextResponse.json(
      { error: "Provide { accountId: string } or { all: true }. Add { confirm: true } to apply corrections." },
      { status: 400 }
    )
  } catch (err) {
    console.error("[API] Recalculate error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
