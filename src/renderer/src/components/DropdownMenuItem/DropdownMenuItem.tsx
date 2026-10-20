import { useContext, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import {
  DropdownMenuItem as UiDropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubIcon,
  DropdownMenuSubTrigger,
  dropdownMenuItemVariants as uiItemVariants,
  dropdownMenuShortcutClass
} from '@renderer/ui/dropdown-menu'
import { DropdownMenuContext } from '../DropdownMenu/DropdownMenu'
import {
  DROPDOWN_MENU_ITEM_DEFAULTS,
  type DropdownMenuItemContractProps
} from './DropdownMenuItem.types'
import { dropdownMenuItemVariants } from './DropdownMenuItem.variants'

export interface DropdownMenuItemProps extends DropdownMenuItemContractProps {
  onSelect?: (event: Event) => void
  /** With `submenu`: the submenu's rows (Move to ▸, Merge into ▸). */
  children?: ReactNode
  className?: string
}

const UI_VARIANT = { neutral: 'default', destructive: 'destructive' } as const

/**
 * DropdownMenuItem — Building block for DropdownMenu rows: icon · label · KeyboardShortcut.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-521
 * Adapter over DropdownMenuItem / DropdownMenuSubTrigger in ui/dropdown-menu.tsx. Inside a
 * DropdownMenu with a trigger it is a live Radix row; elsewhere it renders in place.
 */
export function DropdownMenuItem({
  className,
  onSelect,
  children,
  ...rest
}: DropdownMenuItemProps) {
  const props = { ...DROPDOWN_MENU_ITEM_DEFAULTS, ...rest }
  const mode = useContext(DropdownMenuContext)
  const content = (
    <>
      {props.showIcon && <HugeiconsIcon icon={props.icon} />}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.showShortcut && props.shortcut !== undefined && (
        <span className={dropdownMenuShortcutClass}>{props.shortcut}</span>
      )}
    </>
  )

  if (mode === 'live') {
    if (props.submenu) {
      return (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-ds="DropdownMenuItem"
            disabled={props.disabled}
            className={className}
          >
            {content}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>{children}</DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }
    return (
      <UiDropdownMenuItem
        data-ds="DropdownMenuItem"
        variant={UI_VARIANT[props.variant]}
        disabled={props.disabled}
        {...(onSelect ? { onSelect } : {})}
        {...(className !== undefined ? { className } : {})}
      >
        {content}
      </UiDropdownMenuItem>
    )
  }

  return (
    <div
      data-ds="DropdownMenuItem"
      data-variant={props.variant}
      data-disabled={props.disabled ? '' : undefined}
      role="menuitem"
      aria-disabled={props.disabled || undefined}
      className={cn(
        uiItemVariants({ variant: UI_VARIANT[props.variant] }),
        dropdownMenuItemVariants({ variant: props.variant }),
        // A row on its own takes Figma's 224 width; in a menu it fills the panel.
        mode === undefined && 'w-56',
        className
      )}
    >
      {content}
      {props.submenu && <DropdownMenuSubIcon />}
    </div>
  )
}
