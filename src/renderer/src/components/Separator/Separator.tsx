import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SEPARATOR_CONTRACT,
  SEPARATOR_DEFAULTS,
  type SeparatorContractProps
} from './Separator.types'
import { separatorVariants } from './Separator.variants'

export interface SeparatorProps extends SeparatorContractProps {
  className?: string
}

/**
 * Separator — Divider line bound to border/subtle.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-87
 * Today: ui/separator.tsx
 */
export function Separator({ className, ...rest }: SeparatorProps) {
  const props = { ...SEPARATOR_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Separator" on the root element.
  return (
    <ScaffoldStub
      contract={SEPARATOR_CONTRACT}
      props={props}
      className={cn(separatorVariants({ orientation: props.orientation }), className)}
    />
  )
}
