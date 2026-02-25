/**
 * API route for seeding and wiping demo data.
 *
 * POST /api/seed?action=generate — populate database with demo data
 * POST /api/seed?action=wipe     — clear all finance data
 *
 * Used by the settings page and for development/testing.
 * Requires authentication — only logged-in users can seed/wipe data.
 */

import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { seed } from "@/db/seed"
import { wipe } from "@/db/wipe-seed"

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
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
  } catch (err) {
    console.error("[API] Seed error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
