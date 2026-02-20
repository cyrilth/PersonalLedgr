/**
 * App footer — displays a short disclaimer with a link to the full text.
 * One of three places the disclaimer appears (also: first-launch modal, settings page).
 */

import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t px-6 py-3 text-center text-xs text-muted-foreground md:px-8">
      PersonalLedgr is provided as-is. Not financial advice.{" "}
      <Link href="/settings#disclaimer" className="underline underline-offset-4 hover:text-foreground">
        See Disclaimer for details.
      </Link>
    </footer>
  )
}
