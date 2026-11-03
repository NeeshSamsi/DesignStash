import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  ONBOARDING_STEP_CONTRACT,
  ONBOARDING_STEP_DEFAULTS,
  type OnboardingStepContractProps
} from './OnboardingStep.types'
import { onboardingStepVariants } from './OnboardingStep.variants'

export interface OnboardingStepProps extends OnboardingStepContractProps {
  className?: string
}

/**
 * OnboardingStep — One onboarding page: StepIndicator, title, body, content slot, footer.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4473
 * Today: onboarding/Onboarding.tsx
 */
export function OnboardingStep({ className, ...rest }: OnboardingStepProps) {
  const props = { ...ONBOARDING_STEP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="OnboardingStep" on the root element.
  return (
    <ScaffoldStub
      contract={ONBOARDING_STEP_CONTRACT}
      props={props}
      className={cn(
        onboardingStepVariants({ variant: props.variant, busy: props.busy }),
        className
      )}
    />
  )
}
