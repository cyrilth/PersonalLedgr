"use server"

/**
 * Server actions for user category management.
 *
 * Merges built-in DEFAULT_CATEGORIES with user-created custom categories.
 * Custom categories support soft-delete (isActive flag) so they can be
 * restored if accidentally removed.
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { DEFAULT_CATEGORIES } from "@/lib/constants"

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

export interface CategoryItem {
  id: string | null
  name: string
  isBuiltIn: boolean
  isActive: boolean
}

/**
 * Returns DEFAULT_CATEGORIES merged with user's active custom categories.
 * Each item is marked with isBuiltIn so the UI can distinguish them.
 */
export async function getCategories(): Promise<CategoryItem[]> {
  const userId = await requireUserId()

  const userCategories = await prisma.userCategory.findMany({
    where: { userId, isActive: true },
    orderBy: { name: "asc" },
  })

  const builtIn: CategoryItem[] = DEFAULT_CATEGORIES.map((name) => ({
    id: null,
    name,
    isBuiltIn: true,
    isActive: true,
  }))

  const custom: CategoryItem[] = userCategories.map((c) => ({
    id: c.id,
    name: c.name,
    isBuiltIn: false,
    isActive: c.isActive,
  }))

  return [...builtIn, ...custom]
}

/**
 * Returns a flat list of category names for Select dropdowns.
 * Combines built-in categories with active custom categories.
 */
export async function getCategoryNames(): Promise<string[]> {
  const userId = await requireUserId()

  const userCategories = await prisma.userCategory.findMany({
    where: { userId, isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  })

  const builtInNames = [...DEFAULT_CATEGORIES]
  const customNames = userCategories.map((c) => c.name)

  return [...builtInNames, ...customNames]
}

/**
 * Creates a new custom category for the user.
 * Rejects empty names and names that collide with built-in categories.
 */
export async function createCategory(name: string) {
  const userId = await requireUserId()

  const trimmed = name.trim()
  if (!trimmed) throw new Error("Category name cannot be empty")

  // Check collision with built-in
  const lower = trimmed.toLowerCase()
  if (DEFAULT_CATEGORIES.some((c) => c.toLowerCase() === lower)) {
    throw new Error("A built-in category with this name already exists")
  }

  // Check if a soft-deleted category with this name exists — restore it
  const existing = await prisma.userCategory.findUnique({
    where: { userId_name: { userId, name: trimmed } },
  })

  if (existing) {
    if (existing.isActive) {
      throw new Error("A category with this name already exists")
    }
    // Restore it
    await prisma.userCategory.update({
      where: { id: existing.id },
      data: { isActive: true },
    })
    return { id: existing.id, name: existing.name }
  }

  const created = await prisma.userCategory.create({
    data: { name: trimmed, userId },
  })

  return { id: created.id, name: created.name }
}

/**
 * Renames a custom category. Verifies ownership.
 */
export async function renameCategory(id: string, newName: string) {
  const userId = await requireUserId()

  const trimmed = newName.trim()
  if (!trimmed) throw new Error("Category name cannot be empty")

  const lower = trimmed.toLowerCase()
  if (DEFAULT_CATEGORIES.some((c) => c.toLowerCase() === lower)) {
    throw new Error("Cannot rename to a built-in category name")
  }

  const existing = await prisma.userCategory.findFirst({
    where: { id, userId },
  })
  if (!existing) throw new Error("Category not found")

  await prisma.userCategory.update({
    where: { id },
    data: { name: trimmed },
  })

  return { success: true }
}

/**
 * Soft-deletes a custom category (isActive = false).
 */
export async function deleteCategory(id: string) {
  const userId = await requireUserId()

  const existing = await prisma.userCategory.findFirst({
    where: { id, userId },
  })
  if (!existing) throw new Error("Category not found")

  await prisma.userCategory.update({
    where: { id },
    data: { isActive: false },
  })

  return { success: true }
}

/**
 * Restores a soft-deleted custom category.
 */
export async function restoreCategory(id: string) {
  const userId = await requireUserId()

  const existing = await prisma.userCategory.findFirst({
    where: { id, userId },
  })
  if (!existing) throw new Error("Category not found")

  await prisma.userCategory.update({
    where: { id },
    data: { isActive: true },
  })

  return { success: true }
}

/**
 * Returns all user categories (active + inactive) for settings management UI.
 */
export async function getAllUserCategories() {
  const userId = await requireUserId()

  const categories = await prisma.userCategory.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  })

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.isActive,
  }))
}
