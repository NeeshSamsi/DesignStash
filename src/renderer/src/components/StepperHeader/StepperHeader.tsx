import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  STEPPER_HEADER_CONTRACT,
  STEPPER_HEADER_DEFAULTS,
  type StepperHeaderContractProps
} from './StepperHeader.types'
import { stepperHeaderVariants } from './StepperHeader.variants'

export interface StepperHeaderProps extends StepperHeaderContractProps {
  className?: string
}

/**
 * StepperHeader — Where you are in the review queue: title, “3 of 12”, role badge, progress, Exit.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3265
 * Today: ApprovalStepper.tsx header
 */
export function StepperHeader({ className, ...rest }: StepperHeaderProps) {
  const props = { ...STEPPER_HEADER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="StepperHeader" on the root element.
  return (
    <ScaffoldStub
      contract={STEPPER_HEADER_CONTRACT}
      props={props}
      className={cn(stepperHeaderVariants({ role: props.role }), className)}
    />
  )
}
