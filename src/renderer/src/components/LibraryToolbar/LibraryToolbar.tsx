import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  LIBRARY_TOOLBAR_CONTRACT,
  LIBRARY_TOOLBAR_DEFAULTS,
  type LibraryToolbarContractProps
} from './LibraryToolbar.types'
import { libraryToolbarVariants } from './LibraryToolbar.variants'

export interface LibraryToolbarProps extends LibraryToolbarContractProps {
  className?: string
}

/**
 * LibraryToolbar — Filter (+count) → TagFilterPopover, active chips + Clear, stats, sort Select.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-2228
 * Today: LibraryTopBar.tsx
 */
export function LibraryToolbar({ className, ...rest }: LibraryToolbarProps) {
  const props = { ...LIBRARY_TOOLBAR_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="LibraryToolbar" on the root element.
  return (
    <ScaffoldStub
      contract={LIBRARY_TOOLBAR_CONTRACT}
      props={props}
      className={cn(libraryToolbarVariants({ filters: props.filters }), className)}
    />
  )
}
