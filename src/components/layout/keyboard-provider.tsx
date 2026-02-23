"use client"

/**
 * Client component that wires up global keyboard shortcuts
 * and renders the command palette.
 */

import { useState } from "react"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { CommandPalette } from "@/components/command-palette"

export function KeyboardProvider() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useKeyboardShortcuts({
    onCommandPalette: () => setPaletteOpen(true),
  })

  return (
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
  )
}
