import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { ADD_MENU_CONTRACT, ADD_MENU_DEFAULTS, type AddMenuContractProps } from './AddMenu.types'
import { addMenuVariants } from './AddMenu.variants'

export interface AddMenuProps extends AddMenuContractProps {
  className?: string
}

/**
 * AddMenu — Import entry point: Add files… / Add folder… + drop hint. Disabled while an import runs.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1767
 * Today: AppShell.tsx AddMenu
 */
export function AddMenu({ className, ...rest }: AddMenuProps) {
  const props = { ...ADD_MENU_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="AddMenu" on the root element.
  return (
    <ScaffoldStub
      contract={ADD_MENU_CONTRACT}
      props={props}
      className={cn(addMenuVariants({ open: props.open }), className)}
    />
  )
}
