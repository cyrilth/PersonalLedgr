/**
 * Root layout — wraps the entire application.
 *
 * Provides ThemeProvider (dark/light mode), DisclaimerModal (first-launch legal),
 * and Toaster (sonner toast notifications). Does NOT include sidebar/header — those
 * are in the (app) route group layout. The (auth) route group gets a clean layout
 * without navigation chrome.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DisclaimerModal } from "@/components/disclaimer-modal";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PersonalLedgr",
  description: "Self-hosted personal finance tracking",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <DisclaimerModal />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
