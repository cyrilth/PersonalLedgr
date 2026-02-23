"use client"

/**
 * Registers global keyboard shortcuts.
 * Suppresses handlers when focus is in an input, textarea, or contenteditable.
 */

import { useEffect } from "react"

interface KeyboardShortcutOptions {
  onCommandPalette?: () => void
}

export function useKeyboardShortcuts({ onCommandPalette }: KeyboardShortcutOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when focus is in an input/textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      // Ctrl+K or Cmd+K → command palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        onCommandPalette?.()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCommandPalette])
}
