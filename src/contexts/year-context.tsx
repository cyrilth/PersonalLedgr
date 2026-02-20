"use client"

import { createContext, useContext, useState, useEffect } from "react"

const STORAGE_KEY = "personalledgr-selected-year"

type YearContextValue = {
  year: number
  setYear: (year: number) => void
}

const YearContext = createContext<YearContextValue | null>(null)

function getValidYear(raw: unknown): number | null {
  const n = Number(raw)
  const currentYear = new Date().getFullYear()
  if (Number.isInteger(n) && n >= 2000 && n <= currentYear + 1) return n
  return null
}

export function YearProvider({ children }: { children: React.ReactNode }) {
  const [year, setYearState] = useState<number | null>(null)

  useEffect(() => {
    const stored = getValidYear(localStorage.getItem(STORAGE_KEY))
    setYearState(stored ?? new Date().getFullYear())
  }, [])

  function setYear(y: number) {
    setYearState(y)
    localStorage.setItem(STORAGE_KEY, String(y))
  }

  if (year === null) return null

  return (
    <YearContext.Provider value={{ year, setYear }}>
      {children}
    </YearContext.Provider>
  )
}

export function useYear(): YearContextValue {
  const ctx = useContext(YearContext)
  if (!ctx) throw new Error("useYear must be used within a YearProvider")
  return ctx
}
