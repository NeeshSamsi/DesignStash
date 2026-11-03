import { ICON_STROKE } from '@renderer/design-system/icon'
import { useId, type ComponentProps } from 'react'
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
 * `showNote` adds a caption under the label for what the AI is doing on that step (look-over.md, L6 and L7).
 */
export function PileStep({ className, ...rest }: PileStepProps) {
  const { status, showConnector, showNote, label, note, ...props } = {
    ...PILE_STEP_DEFAULTS,
    ...rest
  }
  const noteId = useId()
  return (
    <button
      type="button"
      data-ds="PileStep"
      data-status={status}
      aria-current={status === 'current' ? 'step' : undefined}
      // The note describes the step; the label stays its name.
      aria-label={showNote ? label : undefined}
      aria-describedby={showNote ? noteId : undefined}
      className={cn(pileStepVariants({ status }), className)}
      {...props}
    >
      <span className={pileStepMarkerVariants({ status })}>
        {status === 'done' && (
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={ICON_STROKE} className="size-2.5" />
        )}
        {status === 'current' && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={pileStepLabelVariants({ status })}>{label}</span>
        {showNote && (
          <span id={noteId} className="truncate type-caption-xs-regular text-tertiary">
            {note}
          </span>
        )}
      </span>
      {showConnector && (
        <span
          aria-hidden
          data-slot="connector"
          className="absolute top-5 -bottom-2 left-3.75 w-0.5 bg-surface-4"
        />
      )}
    </button>
  )
}
