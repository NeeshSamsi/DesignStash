import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  GLOBAL_SEARCH_CONTRACT,
  GLOBAL_SEARCH_DEFAULTS,
  type GlobalSearchContractProps
} from './GlobalSearch.types'
import { globalSearchVariants } from './GlobalSearch.variants'

export interface GlobalSearchProps extends GlobalSearchContractProps {
  className?: string
}

/**
 * GlobalSearch — Title-bar search; ⌘K focuses, 250 ms debounce; zero results → MockupGrid no-results.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1649
 * Today: move out of LibraryTopBar.tsx
 */
export function GlobalSearch({ className, ...rest }: GlobalSearchProps) {
  const props = { ...GLOBAL_SEARCH_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="GlobalSearch" on the root element.
  return (
    <ScaffoldStub
      contract={GLOBAL_SEARCH_CONTRACT}
      props={props}
      className={cn(globalSearchVariants({ state: props.state }), className)}
    />
  )
}
