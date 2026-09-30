import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  RADIO_GROUP_CONTRACT,
  RADIO_GROUP_DEFAULTS,
  type RadioGroupContractProps
} from './RadioGroup.types'
import { radioGroupVariants } from './RadioGroup.variants'

export interface RadioGroupProps extends RadioGroupContractProps {
  className?: string
}

/**
 * RadioGroup — Single-choice item; card variant hosts rich content (ModelRow).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-388
 * Today: ui/radio-group.tsx
 */
export function RadioGroup({ className, ...rest }: RadioGroupProps) {
  const props = { ...RADIO_GROUP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="RadioGroup" on the root element.
  return (
    <ScaffoldStub
      contract={RADIO_GROUP_CONTRACT}
      props={props}
      className={cn(
        radioGroupVariants({ variant: props.variant, selected: props.selected }),
        className
      )}
    />
  )
}
