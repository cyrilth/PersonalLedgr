"use client"

/**
 * First-launch disclaimer modal.
 *
 * Shows a full-screen overlay with the legal disclaimer text on first visit.
 * Cannot be dismissed without clicking "I understand and accept" — no close
 * button, no backdrop click. Acceptance is persisted to localStorage so it
 * only shows once per browser (clearing storage re-shows it).
 *
 * Rendered in the root layout so it appears on all pages including login.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DisclaimerContent } from "@/components/disclaimer-content"

const STORAGE_KEY = "personalledgr-disclaimer-accepted"

export function DisclaimerModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY)
    if (accepted !== "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold">Disclaimer</h2>

        <ScrollArea className="h-[60vh] pr-4">
          <DisclaimerContent />
        </ScrollArea>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleAccept} size="lg">
            I understand and accept
          </Button>
        </div>
      </div>
    </div>
  )
}
