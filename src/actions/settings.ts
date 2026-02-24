"use server"

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function toNumber(d: unknown): number {
  return Number(d)
}

export interface TithingSettings {
  tithingEnabled: boolean
  tithingPercentage: number
  tithingExtraMonthly: number
  tithingCategory: string
}

/**
 * Returns the user's tithing settings, creating a default record if none exists.
 */
export async function getTithingSettings(): Promise<TithingSettings> {
  const userId = await requireUserId()

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      tithingEnabled: true,
      tithingPercentage: true,
      tithingExtraMonthly: true,
      tithingCategory: true,
    },
  })

  return {
    tithingEnabled: settings.tithingEnabled,
    tithingPercentage: toNumber(settings.tithingPercentage),
    tithingExtraMonthly: toNumber(settings.tithingExtraMonthly),
    tithingCategory: settings.tithingCategory,
  }
}

/**
 * Updates the user's tithing settings.
 */
export async function updateTithingSettings(data: {
  tithingEnabled: boolean
  tithingPercentage: number
  tithingExtraMonthly: number
  tithingCategory: string
}): Promise<void> {
  const userId = await requireUserId()

  await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      tithingEnabled: data.tithingEnabled,
      tithingPercentage: data.tithingPercentage,
      tithingExtraMonthly: data.tithingExtraMonthly,
      tithingCategory: data.tithingCategory,
    },
    update: {
      tithingEnabled: data.tithingEnabled,
      tithingPercentage: data.tithingPercentage,
      tithingExtraMonthly: data.tithingExtraMonthly,
      tithingCategory: data.tithingCategory,
    },
  })
}
