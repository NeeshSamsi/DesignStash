import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TOOLTIP_CONTRACT, TOOLTIP_DEFAULTS, type TooltipContractProps } from './Tooltip.types'
import { tooltipVariants } from './Tooltip.variants'

export interface TooltipProps extends TooltipContractProps {
  className?: string
}

/**
 * Tooltip — Labels icon buttons and explains disabled actions. arrow = edge + end of the body the pointer sits on.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=232-4742
 * Today: ui/tooltip.tsx (arrow ↔ Radix side + align)
 */
export function Tooltip({ className, ...rest }: TooltipProps) {
  const props = { ...TOOLTIP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Tooltip" on the root element.
  return (
    <ScaffoldStub
      contract={TOOLTIP_CONTRACT}
      props={props}
      className={cn(tooltipVariants({ arrow: props.arrow }), className)}
    />
  )
}
