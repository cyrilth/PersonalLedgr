"use client"

/**
 * Phased-repayment form fields (deferment / interest-only / subsidized) shared
 * by the dedicated loan form and the Add/Edit Account dialog so both entry
 * points present identical inputs, copy, and bounds. Controlled by the parent;
 * the parent decides whether to render it (only for standard loans/mortgages).
 *
 * The deferment "make sure the balance already includes accrued interest" hint
 * shows whenever deferment > 0 (create AND edit): enabling deferment on an
 * existing loan, or filling in a back-dated loan, both baseline the cron's
 * accrual watermark against the entered balance, so the guidance matters in
 * both modes — not just on first create.
 */

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { MAX_PHASE_MONTHS } from "@/lib/calculations"

interface PhasedRepaymentFieldsProps {
  defermentMonths: string
  onDefermentMonthsChange: (value: string) => void
  interestOnlyMonths: string
  onInterestOnlyMonthsChange: (value: string) => void
  subsidized: boolean
  onSubsidizedChange: (value: boolean) => void
  /** Name of the balance field this form uses, referenced in the deferment hint. */
  balanceFieldLabel?: string
}

export function PhasedRepaymentFields({
  defermentMonths,
  onDefermentMonthsChange,
  interestOnlyMonths,
  onInterestOnlyMonthsChange,
  subsidized,
  onSubsidizedChange,
  balanceFieldLabel = "balance",
}: PhasedRepaymentFieldsProps) {
  const hasDeferment = parseInt(defermentMonths) > 0

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="phase-deferment">Deferment Period (months, optional)</Label>
        <Input
          id="phase-deferment"
          type="number"
          min="0"
          max={MAX_PHASE_MONTHS}
          value={defermentMonths}
          onChange={(e) => onDefermentMonthsChange(e.target.value)}
          placeholder="e.g. 12"
        />
        <p className="text-muted-foreground text-xs">
          Months with no payment due (e.g. while in school). The repayment term
          begins after this and any interest-only period.
        </p>
        {hasDeferment && (
          <p className="text-muted-foreground text-xs">
            Adding a loan that started in the past? Make sure the{" "}
            <strong>{balanceFieldLabel}</strong> above already includes the
            interest accrued during deferment — projections assume it does.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phase-interest-only">Interest-Only Period (months, optional)</Label>
        <Input
          id="phase-interest-only"
          type="number"
          min="0"
          max={MAX_PHASE_MONTHS}
          value={interestOnlyMonths}
          onChange={(e) => onInterestOnlyMonthsChange(e.target.value)}
          placeholder="e.g. 6"
        />
        <p className="text-muted-foreground text-xs">
          Months paying interest only before full payments begin.
        </p>
      </div>

      {hasDeferment && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="phase-subsidized"
            checked={subsidized}
            onCheckedChange={(c) => onSubsidizedChange(c === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="phase-subsidized" className="font-normal">
              Subsidized — no interest during deferment
            </Label>
            <p className="text-muted-foreground text-xs">
              Federal subsidized loans don&apos;t accrue interest while deferred.
              Leave off for private/unsubsidized loans (e.g. SoFi), where interest
              accrues and capitalizes into the balance.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
