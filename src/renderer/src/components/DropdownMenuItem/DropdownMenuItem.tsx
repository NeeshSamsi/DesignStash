import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  DROPDOWN_MENU_ITEM_CONTRACT,
  DROPDOWN_MENU_ITEM_DEFAULTS,
  type DropdownMenuItemContractProps
} from './DropdownMenuItem.types'
import { dropdownMenuItemVariants } from './DropdownMenuItem.variants'

export interface DropdownMenuItemProps extends DropdownMenuItemContractProps {
  className?: string
}

/**
 * DropdownMenuItem — Building block for DropdownMenu rows: icon · label · KeyboardShortcut.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-521
 * Today: DropdownMenuItem in ui/dropdown-menu.tsx
 */
export function DropdownMenuItem({ className, ...rest }: DropdownMenuItemProps) {
  const props = { ...DROPDOWN_MENU_ITEM_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="DropdownMenuItem" on the root element.
  return (
    <ScaffoldStub
      contract={DROPDOWN_MENU_ITEM_CONTRACT}
      props={props}
      className={cn(dropdownMenuItemVariants({ variant: props.variant }), className)}
    />
  )
}
