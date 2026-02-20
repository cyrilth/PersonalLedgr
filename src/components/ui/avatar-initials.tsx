"use client"

/**
 * Reusable avatar component with three fallback levels:
 * 1. Image — renders the user's uploaded avatar photo
 * 2. Initials — extracts first letter of first + last name (e.g., "JD" for "John Doe")
 * 3. Icon — generic User icon when no name is available
 *
 * Available in sm (32px), md (40px), and lg (64px) sizes.
 * Used in the sidebar user menu, profile page, and anywhere user identity is shown.
 */

import { User } from "lucide-react"
import { cn } from "@/lib/utils"

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
} as const

/** Extract initials: "John Doe" → "JD", "Alice" → "A", "" → null */
function getInitials(name?: string): string | null {
  if (!name?.trim()) return null
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return parts[0][0].toUpperCase()
}

interface AvatarInitialsProps {
  name?: string | null
  image?: string | null
  size?: "sm" | "md" | "lg"
  className?: string
}

export function AvatarInitials({ name, image, size = "md", className }: AvatarInitialsProps) {
  const sizeClass = sizeClasses[size]

  if (image) {
    return (
      <img
        src={image}
        alt={name || "User avatar"}
        className={cn("rounded-full object-cover", sizeClass, className)}
      />
    )
  }

  const initials = getInitials(name ?? undefined)

  if (initials) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-emerald-600 font-semibold text-white",
          sizeClass,
          className
        )}
      >
        {initials}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
        sizeClass,
        className
      )}
    >
      <User className="h-1/2 w-1/2" />
    </div>
  )
}
