import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { SWITCH_CONTRACT, SWITCH_DEFAULTS, type SwitchContractProps } from './Switch.types'
import { switchVariants } from './Switch.variants'

export interface SwitchProps extends SwitchContractProps {
  className?: string
}

/**
 * Switch — Binary settings (telemetry consent, AI on/off).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-339
 * Today: ui/switch.tsx (size="default" ↔ base)
 */
export function Switch({ className, ...rest }: SwitchProps) {
  const props = { ...SWITCH_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Switch" on the root element.
  return (
    <ScaffoldStub
      contract={SWITCH_CONTRACT}
      props={props}
      className={cn(switchVariants({ size: props.size, checked: props.checked }), className)}
    />
  )
}
