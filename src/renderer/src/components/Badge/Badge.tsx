import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { BADGE_CONTRACT, BADGE_DEFAULTS, type BadgeContractProps } from './Badge.types'
import { badgeVariants } from './Badge.variants'

export interface BadgeProps extends BadgeContractProps {
  className?: string
}

/**
 * Badge — Small status / count label; status variants use weak fills + coloured text.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-78
 * Today: ui/badge.tsx (variant="default" ↔ primary)
 */
export function Badge({ className, ...rest }: BadgeProps) {
  const props = { ...BADGE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Badge" on the root element.
  return (
    <ScaffoldStub
      contract={BADGE_CONTRACT}
      props={props}
      className={cn(badgeVariants({ variant: props.variant }), className)}
    />
  )
}
