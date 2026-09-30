import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { POPOVER_CONTRACT, POPOVER_DEFAULTS, type PopoverContractProps } from './Popover.types'
import { popoverVariants } from './Popover.variants'

export interface PopoverProps extends PopoverContractProps {
  className?: string
}

/**
 * Popover — Anchored panel (tag filter, tag suggestions).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-341
 * Today: ui/popover.tsx
 */
export function Popover({ className, ...rest }: PopoverProps) {
  const props = { ...POPOVER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Popover" on the root element.
  return (
    <ScaffoldStub
      contract={POPOVER_CONTRACT}
      props={props}
      className={cn(popoverVariants({ size: props.size }), className)}
    />
  )
}
