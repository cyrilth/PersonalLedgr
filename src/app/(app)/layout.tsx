/**
 * App route group layout — provides the authenticated chrome.
 *
 * Wraps all (app)/ pages with: YearProvider (global year context), Sidebar
 * (navigation + user menu + theme toggle), Header (page title + year picker),
 * and Footer (disclaimer link). This layout is only rendered for authenticated
 * users — the proxy redirects unauthenticated requests to /login.
 */

import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { KeyboardProvider } from "@/components/layout/keyboard-provider"
import { YearProvider } from "@/contexts/year-context"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <YearProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
          <Footer />
        </div>
      </div>
      <KeyboardProvider />
    </YearProvider>
  )
}
