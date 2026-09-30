import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  MODEL_PICKER_CONTRACT,
  MODEL_PICKER_DEFAULTS,
  type ModelPickerContractProps
} from './ModelPicker.types'
import { modelPickerVariants } from './ModelPicker.variants'

export interface ModelPickerProps extends ModelPickerContractProps {
  className?: string
}

/**
 * ModelPicker — HardwareSummary + AI Switch + 3 picker ModelRows; ai=off dims the list.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=278-5325
 */
export function ModelPicker({ className, ...rest }: ModelPickerProps) {
  const props = { ...MODEL_PICKER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ModelPicker" on the root element.
  return (
    <ScaffoldStub
      contract={MODEL_PICKER_CONTRACT}
      props={props}
      className={cn(modelPickerVariants({ ai: props.ai }), className)}
    />
  )
}
