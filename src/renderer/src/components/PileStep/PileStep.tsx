import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@renderer/lib/utils'
import { PILE_STEP_DEFAULTS, type PileStepContractProps } from './PileStep.types'
import {
  pileStepLabelVariants,
  pileStepMarkerVariants,
  pileStepVariants
} from './PileStep.variants'

export interface PileStepProps
  extends PileStepContractProps, Omit<ComponentProps<'button'>, keyof PileStepContractProps> {}

/**
 * PileStep — One mockup in a pile, in PileRail: done (draft ready) · current · todo · skipped.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=566-15523
 * Everything in a pile is a draft until Stash pile, so every step is a button. `done` is a neutral
 * tick, not green: nothing is stashed yet. `showConnector` draws the line to the next step (off for the last).
 */
export function PileStep({ className, ...rest }: PileStepProps) {
  const { status, showConnector, label, ...props } = { ...PILE_STEP_DEFAULTS, ...rest }
  return (
    <button
      type="button"
      data-ds="PileStep"
      data-status={status}
      aria-current={status === 'current' ? 'step' : undefined}
      className={cn(pileStepVariants({ status }), className)}
      {...props}
    >
      <span className={pileStepMarkerVariants({ status })}>
        {status === 'done' && (
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-2.5" />
        )}
        {status === 'current' && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
      <span className={pileStepLabelVariants({ status })}>{label}</span>
      {showConnector && (
        <span
          aria-hidden
          className="absolute top-full left-3.75 h-2 w-0.5 -translate-y-1 bg-surface-4"
        />
      )}
    </button>
  )
}
