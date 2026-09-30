import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  GROUP_MEMBER_THUMB_CONTRACT,
  GROUP_MEMBER_THUMB_DEFAULTS,
  type GroupMemberThumbContractProps
} from './GroupMemberThumb.types'
import { groupMemberThumbVariants } from './GroupMemberThumb.variants'

export interface GroupMemberThumbProps extends GroupMemberThumbContractProps {
  className?: string
}

/**
 * GroupMemberThumb — Draggable member of a proposed group (cover + file name + Primary badge).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-2979
 * Today: GroupingReview.tsx
 */
export function GroupMemberThumb({ className, ...rest }: GroupMemberThumbProps) {
  const props = { ...GROUP_MEMBER_THUMB_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="GroupMemberThumb" on the root element.
  return (
    <ScaffoldStub
      contract={GROUP_MEMBER_THUMB_CONTRACT}
      props={props}
      className={cn(groupMemberThumbVariants({ state: props.state }), className)}
    />
  )
}
