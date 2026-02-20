/**
 * API route for seeding and wiping demo data.
 *
 * POST /api/seed?action=generate — populate database with demo data
 * POST /api/seed?action=wipe     — clear all finance data
 *
 * Used by the settings page and for development/testing.
 * Note: no auth check — should be restricted in production.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/db"
import { seed } from "@/db/seed"
import { wipe } from "@/db/wipe-seed"

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get("action")

  if (action === "generate") {
    await seed(prisma)
    return NextResponse.json({ message: "Seed data generated" })
  }

  if (action === "wipe") {
    await wipe(prisma)
    return NextResponse.json({ message: "All finance data wiped" })
  }

  return NextResponse.json({ error: "Invalid action. Use ?action=generate or ?action=wipe" }, { status: 400 })
}
