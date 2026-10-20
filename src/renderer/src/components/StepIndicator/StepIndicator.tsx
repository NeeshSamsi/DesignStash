import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { STEP_INDICATOR_DEFAULTS, type StepIndicatorContractProps } from './StepIndicator.types'
import { stepIndicatorMarkVariants, stepIndicatorVariants } from './StepIndicator.variants'

export interface StepIndicatorProps
  extends
    StepIndicatorContractProps,
    Omit<ComponentProps<'div'>, keyof StepIndicatorContractProps | 'children'> {
  /** How many steps there are. Figma draws 5. */
  total?: number
}

/**
 * StepIndicator — Progress through the onboarding steps: complete and current are primary, upcoming is surface-4. Segments (default) or dots.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-3556
 */
export function StepIndicator({ className, total = 5, ...rest }: StepIndicatorProps) {
  const { variant, step, ...props } = { ...STEP_INDICATOR_DEFAULTS, ...rest }
  const current = Number(step)
  return (
    <div
      data-ds="StepIndicator"
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={`Step ${current} of ${total}`}
      className={cn(stepIndicatorVariants({ variant, step }), className)}
      {...props}
    >
      {Array.from({ length: total }, (_, index) => {
        const status =
          index + 1 < current ? 'complete' : index + 1 === current ? 'current' : 'upcoming'
        return (
          <div
            key={index}
            data-status={status}
            className={stepIndicatorMarkVariants({ variant, status })}
          />
        )
      })}
    </div>
  )
}
