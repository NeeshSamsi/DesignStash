import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  CATEGORY_PILL_CONTRACT,
  CATEGORY_PILL_DEFAULTS,
  type CategoryPillContractProps
} from './CategoryPill.types'
import { categoryPillVariants } from './CategoryPill.variants'

export interface CategoryPillProps extends CategoryPillContractProps {
  className?: string
}

/**
 * CategoryPill — Category filter inside TagFilterPopover: All, then one pill per tag category with how many tags match; counts update while you search. Rules: design/specs/library.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=583-6970
 */
export function CategoryPill({ className, ...rest }: CategoryPillProps) {
  const props = { ...CATEGORY_PILL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CategoryPill" on the root element.
  return (
    <ScaffoldStub
      contract={CATEGORY_PILL_CONTRACT}
      props={props}
      className={cn(categoryPillVariants({ active: props.active }), className)}
    />
  )
}
