import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { SELECT_CONTRACT, SELECT_DEFAULTS, type SelectContractProps } from './Select.types'
import { selectVariants } from './Select.variants'

export interface SelectProps extends SelectContractProps {
  className?: string
}

/**
 * Select — Dropdown choice (sort order, tag category).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-459
 * Today: ui/select.tsx (size="default" ↔ base)
 */
export function Select({ className, ...rest }: SelectProps) {
  const props = { ...SELECT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Select" on the root element.
  return (
    <ScaffoldStub
      contract={SELECT_CONTRACT}
      props={props}
      className={cn(selectVariants({ size: props.size, open: props.open }), className)}
    />
  )
}
