import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { CHECKBOX_CONTRACT, CHECKBOX_DEFAULTS, type CheckboxContractProps } from './Checkbox.types'
import { checkboxVariants } from './Checkbox.variants'

export interface CheckboxProps extends CheckboxContractProps {
  className?: string
}

/**
 * Checkbox — Multi-select (tag filter rows). indeterminate = parent tag partly selected.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-302
 * Today: ui/checkbox.tsx
 */
export function Checkbox({ className, ...rest }: CheckboxProps) {
  const props = { ...CHECKBOX_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Checkbox" on the root element.
  return (
    <ScaffoldStub
      contract={CHECKBOX_CONTRACT}
      props={props}
      className={cn(checkboxVariants({ state: props.state }), className)}
    />
  )
}
