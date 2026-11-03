import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  DropdownMenu as UiDropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  dropdownMenuLabelClass,
  dropdownMenuPanelClass,
  dropdownMenuSeparatorClass
} from '@renderer/ui/dropdown-menu'
import { DROPDOWN_MENU_DEFAULTS, type DropdownMenuContractProps } from './DropdownMenu.types'
import { dropdownMenuVariants } from './DropdownMenu.variants'

/**
 * How rows render: `live` inside an open Radix menu, `static` inside an in-place panel
 * (catalog), undefined for a row on its own.
 */
export const DropdownMenuContext = createContext<'live' | 'static' | undefined>(undefined)

export interface DropdownMenuProps extends DropdownMenuContractProps {
  /** The element that opens it. Without it the panel renders in place (catalog). */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

/**
 * DropdownMenu — Action menu panel composed of DropdownMenu Item rows.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-552
 * Adapter over ui/dropdown-menu.tsx; Radix collision handling keeps it on screen.
 * `items`: DropdownMenuItem rows, DropdownMenuDivider and DropdownMenuHint.
 */
export function DropdownMenu({
  className,
  trigger,
  open,
  onOpenChange,
  align,
  side,
  ...rest
}: DropdownMenuProps) {
  const props = { ...DROPDOWN_MENU_DEFAULTS, ...rest }
  const classes = cn(dropdownMenuVariants(), className)

  if (trigger !== undefined) {
    return (
      <UiDropdownMenu
        {...(open !== undefined ? { open } : {})}
        {...(onOpenChange ? { onOpenChange } : {})}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          data-ds="DropdownMenu"
          {...(align ? { align } : {})}
          {...(side ? { side } : {})}
          className={classes}
        >
          <DropdownMenuContext.Provider value="live">{props.items}</DropdownMenuContext.Provider>
        </DropdownMenuContent>
      </UiDropdownMenu>
    )
  }

  return (
    <div data-ds="DropdownMenu" role="menu" className={cn(dropdownMenuPanelClass, classes)}>
      <DropdownMenuContext.Provider value="static">{props.items}</DropdownMenuContext.Provider>
    </div>
  )
}

/** Separator row between item groups. */
export function DropdownMenuDivider() {
  return useContext(DropdownMenuContext) === 'live' ? (
    <DropdownMenuSeparator />
  ) : (
    <div role="separator" className={dropdownMenuSeparatorClass} />
  )
}

/** Quiet hint row, e.g. “or drop PSDs anywhere”. */
export function DropdownMenuHint({ children }: { children: ReactNode }) {
  return useContext(DropdownMenuContext) === 'live' ? (
    <DropdownMenuLabel>{children}</DropdownMenuLabel>
  ) : (
    <div className={dropdownMenuLabelClass}>{children}</div>
  )
}
