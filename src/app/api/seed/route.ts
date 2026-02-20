import { NextRequest, NextResponse } from "next/server"
import { seed } from "@/db/seed"
import { wipe } from "@/db/wipe-seed"

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get("action")

  if (action === "generate") {
    await seed()
    return NextResponse.json({ message: "Seed data generated" })
  }

  if (action === "wipe") {
    await wipe()
    return NextResponse.json({ message: "All finance data wiped" })
  }

  return NextResponse.json({ error: "Invalid action. Use ?action=generate or ?action=wipe" }, { status: 400 })
}
