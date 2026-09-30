import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  GROUP_CARD_CONTRACT,
  GROUP_CARD_DEFAULTS,
  type GroupCardContractProps
} from './GroupCard.types'
import { groupCardVariants } from './GroupCard.variants'

export interface GroupCardProps extends GroupCardContractProps {
  className?: string
}

/**
 * GroupCard — A proposed group or the Standalone tray, as a drop zone of GroupMemberThumbs.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3163
 * Today: GroupingReview.tsx
 */
export function GroupCard({ className, ...rest }: GroupCardProps) {
  const props = { ...GROUP_CARD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="GroupCard" on the root element.
  return (
    <ScaffoldStub
      contract={GROUP_CARD_CONTRACT}
      props={props}
      className={cn(groupCardVariants({ variant: props.variant, state: props.state }), className)}
    />
  )
}
