import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  FLOW_MODAL_CONTRACT,
  FLOW_MODAL_DEFAULTS,
  type FlowModalContractProps
} from './FlowModal.types'
import { flowModalVariants } from './FlowModal.variants'

export interface FlowModalProps extends FlowModalContractProps {
  className?: string
}

/**
 * FlowModal — Large captured modal for Sort + Look it over. Named steps with counts; Finish later always available and always confirms.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=374-5650
 * Today: ui/dialog.tsx (replaces StepperHeader)
 */
export function FlowModal({ className, ...rest }: FlowModalProps) {
  const props = { ...FLOW_MODAL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="FlowModal" on the root element.
  return (
    <ScaffoldStub
      contract={FLOW_MODAL_CONTRACT}
      props={props}
      className={cn(flowModalVariants({ step: props.step }), className)}
    />
  )
}
