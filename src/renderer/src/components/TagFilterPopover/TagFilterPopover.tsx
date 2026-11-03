import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  TAG_FILTER_POPOVER_CONTRACT,
  TAG_FILTER_POPOVER_DEFAULTS,
  type TagFilterPopoverContractProps
} from './TagFilterPopover.types'
import { tagFilterPopoverVariants } from './TagFilterPopover.variants'

export interface TagFilterPopoverProps extends TagFilterPopoverContractProps {
  className?: string
}

/**
 * TagFilterPopover — Filter by tags grouped by category; parent matches children.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-2113
 * Today: LibraryTopBar.tsx popover
 */
export function TagFilterPopover({ className, ...rest }: TagFilterPopoverProps) {
  const props = { ...TAG_FILTER_POPOVER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TagFilterPopover" on the root element.
  return (
    <ScaffoldStub
      contract={TAG_FILTER_POPOVER_CONTRACT}
      props={props}
      className={cn(tagFilterPopoverVariants({ state: props.state }), className)}
    />
  )
}
