import { NextRequest, NextResponse } from "next/server"
import {
  recalculateBalance,
  confirmRecalculate,
  recalculateAllBalances,
  confirmRecalculateAll,
} from "@/actions/accounts"

export async function POST(request: NextRequest) {
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
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
