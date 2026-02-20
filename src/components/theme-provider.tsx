"use client"

/**
 * Theme provider wrapping next-themes.
 *
 * Configured for class-based dark mode (Tailwind's "class" strategy),
 * system preference detection, and localStorage persistence.
 * Rendered in the root layout so all pages inherit the theme.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="personalledgr-theme"
    >
      {children}
    </NextThemesProvider>
  )
}
