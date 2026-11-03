import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  DROPDOWN_MENU_CONTRACT,
  DROPDOWN_MENU_DEFAULTS,
  type DropdownMenuContractProps
} from './DropdownMenu.types'
import { dropdownMenuVariants } from './DropdownMenu.variants'

export interface DropdownMenuProps extends DropdownMenuContractProps {
  className?: string
}

/**
 * DropdownMenu — Action menu panel composed of DropdownMenu Item rows.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-552
 * Today: ui/dropdown-menu.tsx
 */
export function DropdownMenu({ className, ...rest }: DropdownMenuProps) {
  const props = { ...DROPDOWN_MENU_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="DropdownMenu" on the root element.
  return (
    <ScaffoldStub
      contract={DROPDOWN_MENU_CONTRACT}
      props={props}
      className={cn(dropdownMenuVariants(), className)}
    />
  )
}
