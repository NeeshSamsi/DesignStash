import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SETTING_ROW_CONTRACT,
  SETTING_ROW_DEFAULTS,
  type SettingRowContractProps
} from './SettingRow.types'
import { settingRowVariants } from './SettingRow.variants'

export interface SettingRowProps extends SettingRowContractProps {
  className?: string
}

/**
 * SettingRow — Label + description left, control right (stacked for wide controls).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-1487
 */
export function SettingRow({ className, ...rest }: SettingRowProps) {
  const props = { ...SETTING_ROW_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="SettingRow" on the root element.
  return (
    <ScaffoldStub
      contract={SETTING_ROW_CONTRACT}
      props={props}
      className={cn(settingRowVariants({ variant: props.variant, state: props.state }), className)}
    />
  )
}
