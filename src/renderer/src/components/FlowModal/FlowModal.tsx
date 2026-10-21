import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { DialogFrame } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import { DialogDescription, DialogTitle } from '@renderer/ui/dialog'
import { FLOW_MODAL_DEFAULTS, type FlowModalContractProps } from './FlowModal.types'
import { FLOW_BODY, FLOW_HEADER, FLOW_TRACK, flowModalVariants } from './FlowModal.variants'

export interface FlowModalProps
  extends
    FlowModalContractProps,
    Omit<ComponentProps<'div'>, keyof FlowModalContractProps | 'title'> {
  /** Live Radix dialog when given; without it the modal renders in place (catalog). */
  open?: boolean
  /**
   * Esc or a click outside. The modal never closes itself: Finish later always confirms, so the screen
   * opens that ConfirmDialog (or does nothing while a pile is mid-edit) from here.
   */
  onRequestClose?: () => void
  /** The tally by the current step: "38 mockups" in Sort, "3 of 12" in Look it over. Empty shows no badge. */
  count?: string
  /** Look it over: how far through the haul, 0 to 1. Fills the second track. Figma's sample is 0.25. */
  progress?: number
}

const STEPS = ['Sort into piles', 'Look it over', 'Tucked away'] as const

/** The numbered or ticked marker of one step. */
function Marker({ index, state }: { index: number; state: 'done' | 'current' | 'todo' }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full type-label-xs-medium',
        state === 'done' && 'bg-success-weak text-success',
        state === 'current' && 'bg-primary text-on-primary',
        state === 'todo' && 'border border-strong text-tertiary'
      )}
    >
      {state === 'done' ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={ICON_STROKE} className="size-4" />
      ) : (
        index + 1
      )}
    </span>
  )
}

/**
 * FlowModal — Large captured modal for Sort + Look it over: named steps with counts, and the step's body.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=374-5650
 * Used by the Sort and Look it over flows. Finish later always confirms (the screen owns that dialog), so Esc and outside
 * presses only ask via `onRequestClose`. Padding is built in; pass the step's content as `body`.
 */
export function FlowModal({
  className,
  open,
  onRequestClose,
  count,
  progress,
  ...rest
}: FlowModalProps) {
  const { step, body, ...props } = { ...FLOW_MODAL_DEFAULTS, ...rest }
  const current = step === 'sort' ? 0 : 1
  const shown = count ?? (step === 'sort' ? '38 mockups' : '3 of 12')
  const fill = Math.max(0, Math.min(1, progress ?? 0.25))

  const content: ReactNode = (
    <>
      {open !== undefined && (
        <>
          <DialogTitle className="sr-only">{STEPS[current]}</DialogTitle>
          <DialogDescription className="sr-only">Step {current + 1} of 3</DialogDescription>
        </>
      )}
      <ol className={FLOW_HEADER} aria-label="Steps">
        {STEPS.map((name, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo'
          return (
            <li
              key={name}
              data-step-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn('flex items-center gap-4', index > 0 && 'min-w-0 flex-1')}
            >
              {index > 0 && (
                <span aria-hidden className={FLOW_TRACK}>
                  {index === 1 && step === 'look-over' && (
                    <span className="absolute inset-0 bg-primary" />
                  )}
                  {index === 2 && step === 'look-over' && (
                    <span
                      className="absolute inset-y-0 left-0 bg-primary"
                      style={{ width: `${fill * 100}%` }}
                    />
                  )}
                </span>
              )}
              <span className="flex shrink-0 items-center gap-2">
                <Marker index={index} state={state} />
                <span
                  className={cn(
                    'type-body-sm-medium whitespace-nowrap',
                    state === 'current' && 'text-foreground',
                    state === 'done' && 'text-muted-foreground',
                    state === 'todo' && 'text-tertiary'
                  )}
                >
                  {name}
                </span>
                {state === 'current' && shown !== '' && <Badge variant="secondary">{shown}</Badge>}
              </span>
            </li>
          )
        })}
      </ol>
      <div className={FLOW_BODY}>{body}</div>
    </>
  )

  if (open === undefined) {
    return (
      <div
        data-ds="FlowModal"
        data-step={step}
        className={cn(flowModalVariants({ step }), className)}
        {...props}
      >
        {content}
      </div>
    )
  }

  return (
    <DialogFrame
      open={open}
      dataDs="FlowModal"
      blocking={false}
      onDismiss={onRequestClose}
      className={cn(flowModalVariants({ step }), 'gap-0 p-0', className)}
    >
      {content}
    </DialogFrame>
  )
}
