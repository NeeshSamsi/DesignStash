import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  MODEL_ROW_CONTRACT,
  MODEL_ROW_DEFAULTS,
  type ModelRowContractProps
} from './ModelRow.types'
import { modelRowVariants } from './ModelRow.variants'

export interface ModelRowProps extends ModelRowContractProps {
  className?: string
}

/**
 * ModelRow — One on-device model through its whole lifecycle — picker or manage.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4073
 * Today: Onboarding + SettingsAiPane
 */
export function ModelRow({ className, ...rest }: ModelRowProps) {
  const props = { ...MODEL_ROW_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ModelRow" on the root element.
  return (
    <ScaffoldStub
      contract={MODEL_ROW_CONTRACT}
      props={props}
      className={cn(modelRowVariants({ variant: props.variant, state: props.state }), className)}
    />
  )
}
