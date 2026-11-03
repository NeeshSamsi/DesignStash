import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { STEP_BAR_DEFAULTS, type StepBarContractProps } from './StepBar.types'
import { stepBarStepVariants, stepBarVariants } from './StepBar.variants'

export interface StepBarProps
  extends StepBarContractProps, Omit<ComponentProps<'div'>, keyof StepBarContractProps> {}

/**
 * StepBar — A five-step rating bar (quality, speed): the first `value` of five 12×4 steps are filled
 * in background/primary, the rest in background/surface-3.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=1151-270293
 * It has no name of its own: the caller labels it (ModelCard: role="img", "quality 4 of 5").
 */
export function StepBar({ className, ...rest }: StepBarProps) {
  const { value, ...props } = { ...STEP_BAR_DEFAULTS, ...rest }
  const filled = Number(value)
  return (
    <div
      data-ds="StepBar"
      data-value={value}
      className={cn(stepBarVariants({ value }), className)}
      {...props}
    >
      {[0, 1, 2, 3, 4].map((step) => (
        <span key={step} className={stepBarStepVariants({ filled: step < filled })} />
      ))}
    </div>
  )
}
