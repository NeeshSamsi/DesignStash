import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TAG_CHIP_CONTRACT, TAG_CHIP_DEFAULTS, type TagChipContractProps } from './TagChip.types'
import { tagChipVariants } from './TagChip.variants'

export interface TagChipProps extends TagChipContractProps {
  className?: string
}

/**
 * TagChip — A tag as a pill: category · label.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1203
 */
export function TagChip({ className, ...rest }: TagChipProps) {
  const props = { ...TAG_CHIP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TagChip" on the root element.
  return (
    <ScaffoldStub
      contract={TAG_CHIP_CONTRACT}
      props={props}
      className={cn(tagChipVariants({ variant: props.variant }), className)}
    />
  )
}
