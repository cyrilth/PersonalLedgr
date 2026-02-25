"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onRangeChange: (startDate: string, endDate: string) => void
}

function formatDateInput(date: Date): string {
  return date.toISOString().split("T")[0]
}

function getPresetRange(preset: string): [string, string] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (preset) {
    case "this-month":
      return [formatDateInput(new Date(year, month, 1)), formatDateInput(now)]
    case "last-month":
      return [
        formatDateInput(new Date(year, month - 1, 1)),
        formatDateInput(new Date(year, month, 0)),
      ]
    case "this-quarter": {
      const qStart = Math.floor(month / 3) * 3
      return [formatDateInput(new Date(year, qStart, 1)), formatDateInput(now)]
    }
    case "this-year":
      return [formatDateInput(new Date(year, 0, 1)), formatDateInput(now)]
    case "last-year":
      return [
        formatDateInput(new Date(year - 1, 0, 1)),
        formatDateInput(new Date(year - 1, 11, 31)),
      ]
    case "last-12":
      return [
        formatDateInput(new Date(year, month - 12, now.getDate())),
        formatDateInput(now),
      ]
    default:
      return [formatDateInput(new Date(year, 0, 1)), formatDateInput(now)]
  }
}

const presets = [
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "this-quarter", label: "This Quarter" },
  { key: "this-year", label: "This Year" },
  { key: "last-year", label: "Last Year" },
  { key: "last-12", label: "Last 12 Months" },
]

export function DateRangePicker({ startDate, endDate, onRangeChange }: DateRangePickerProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onRangeChange(e.target.value, endDate)}
          className="w-[160px]"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onRangeChange(startDate, e.target.value)}
          className="w-[160px]"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button
            key={p.key}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const [s, e] = getPresetRange(p.key)
              onRangeChange(s, e)
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
