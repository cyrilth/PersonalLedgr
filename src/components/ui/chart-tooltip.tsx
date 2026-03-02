"use client"

/**
 * Shared custom Recharts tooltip that uses Tailwind classes for proper
 * theme-aware styling in both light and dark modes.
 *
 * Recharts inline `contentStyle` doesn't resolve CSS variables reliably
 * because tooltips render in a portal. Using a custom `content` component
 * with Tailwind classes solves this.
 */

interface ChartTooltipPayloadItem {
  name?: string
  value?: number
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: string | number
  labelFormatter?: (label: string | number) => string
  nameFormatter?: (name: string) => string
  valueFormatter?: (value: number) => string
}

function defaultValueFormatter(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  nameFormatter,
  valueFormatter = defaultValueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const displayLabel = labelFormatter && label != null ? labelFormatter(label) : label

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      {displayLabel && (
        <p className="mb-1 font-medium text-popover-foreground">{displayLabel}</p>
      )}
      {payload.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-popover-foreground/70">
            {nameFormatter && item.name ? nameFormatter(item.name) : item.name}
          </span>
          <span className="ml-auto font-medium text-popover-foreground">
            {valueFormatter(item.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}
