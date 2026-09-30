import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  STEP_INDICATOR_CONTRACT,
  STEP_INDICATOR_DEFAULTS,
  type StepIndicatorContractProps
} from './StepIndicator.types'
import { stepIndicatorVariants } from './StepIndicator.variants'

export interface StepIndicatorProps extends StepIndicatorContractProps {
  className?: string
}

/**
 * StepIndicator — Progress through the 5 onboarding steps.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-3556
 * Today: onboarding/Onboarding.tsx
 */
export function StepIndicator({ className, ...rest }: StepIndicatorProps) {
  const props = { ...STEP_INDICATOR_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="StepIndicator" on the root element.
  return (
    <ScaffoldStub
      contract={STEP_INDICATOR_CONTRACT}
      props={props}
      className={cn(stepIndicatorVariants({ variant: props.variant, step: props.step }), className)}
    />
  )
}
