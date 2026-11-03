import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SECTION_HEADER_CONTRACT,
  SECTION_HEADER_DEFAULTS,
  type SectionHeaderContractProps
} from './SectionHeader.types'
import { sectionHeaderVariants } from './SectionHeader.variants'

export interface SectionHeaderProps extends SectionHeaderContractProps {
  className?: string
}

/**
 * SectionHeader — Title + count + bulk actions over a list.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-1350
 */
export function SectionHeader({ className, ...rest }: SectionHeaderProps) {
  const props = { ...SECTION_HEADER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="SectionHeader" on the root element.
  return (
    <ScaffoldStub
      contract={SECTION_HEADER_CONTRACT}
      props={props}
      className={cn(sectionHeaderVariants({ variant: props.variant }), className)}
    />
  )
}
