"use client"

/**
 * Horizontal filter bar for the transactions page.
 *
 * Provides account, type, category, date range, and search filters.
 * All values are managed by the parent via `filters` / `onFiltersChange`.
 */

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants"
import type { TransactionType } from "@/lib/constants"

export interface TransactionFilters {
  accountId: string
  type: string
  category: string
  dateFrom: string
  dateTo: string
  search: string
}

export const EMPTY_FILTERS: TransactionFilters = {
  accountId: "",
  type: "",
  category: "",
  dateFrom: "",
  dateTo: "",
  search: "",
}

interface AccountOption {
  id: string
  name: string
  owner: string | null
}

interface TransactionFilterBarProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
  accounts: AccountOption[]
  categories?: string[]
}

export function TransactionFilterBar({
  filters,
  onFiltersChange,
  accounts,
  categories = [],
}: TransactionFilterBarProps) {
  function update(patch: Partial<TransactionFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  const hasFilters = Object.values(filters).some((v) => v !== "")

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Account */}
      <div className="w-44">
        <Select
          value={filters.accountId || "all"}
          onValueChange={(v) => update({ accountId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.owner ? `${a.name} (${a.owner})` : a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type */}
      <div className="w-40">
        <Select
          value={filters.type || "all"}
          onValueChange={(v) => update({ type: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      <div className="w-40">
        <Select
          value={filters.category || "all"}
          onValueChange={(v) => update({ category: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date From */}
      <div className="w-36">
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          placeholder="From"
        />
      </div>

      {/* Date To */}
      <div className="w-36">
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          placeholder="To"
        />
      </div>

      {/* Search */}
      <div className="w-48">
        <Input
          type="text"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search description..."
        />
      </div>

      {/* Clear */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange(EMPTY_FILTERS)}
          className="text-muted-foreground"
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  )
}
