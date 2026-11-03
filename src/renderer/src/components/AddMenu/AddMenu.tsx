import { ICON_STROKE } from '@renderer/design-system/icon'
import { FileAddIcon, FolderAddIcon, AddSquareIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuHint
} from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem/DropdownMenuItem'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { ADD_MENU_DEFAULTS, type AddMenuContractProps } from './AddMenu.types'
import { addMenuNoteClass, addMenuTriggerClass, addMenuVariants } from './AddMenu.variants'

export interface AddMenuProps extends AddMenuContractProps {
  onAddFiles?: () => void
  onAddFolder?: () => void
  onOpenChange?: (open: boolean) => void
  className?: string
}

/**
 * AddMenu — Import entry point: Add files… / Add folder… + drop hint. Disabled while an import runs.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1767
 * The `open` prop controls the menu; leave it out and the trigger opens it. The Figma `shortcut`
 * slot is the exposed KeyboardShortcut of a menu row: the row hints are fixed here (⌘O, ⇧⌘O).
 */
export function AddMenu({
  className,
  onAddFiles,
  onAddFolder,
  onOpenChange,
  ...rest
}: AddMenuProps) {
  const { open } = rest
  const { disabled } = { ...ADD_MENU_DEFAULTS, ...rest }
  return (
    <div
      data-ds="AddMenu"
      data-state={disabled ? 'disabled' : open ? 'open' : 'closed'}
      className={cn(addMenuVariants({ open: open ?? false, disabled }), className)}
    >
      <DropdownMenu
        {...(open !== undefined ? { open } : {})}
        {...(onOpenChange ? { onOpenChange } : {})}
        align="start"
        trigger={
          <Button size="lg" disabled={disabled} className={addMenuTriggerClass}>
            <HugeiconsIcon icon={AddSquareIcon} strokeWidth={ICON_STROKE} />
            Add a mockup
          </Button>
        }
        items={
          <>
            <DropdownMenuItem
              label="Add files…"
              icon={FileAddIcon}
              shortcut="⌘O"
              {...(onAddFiles ? { onSelect: onAddFiles } : {})}
            />
            <DropdownMenuItem
              label="Add folder…"
              icon={FolderAddIcon}
              shortcut="⇧⌘O"
              {...(onAddFolder ? { onSelect: onAddFolder } : {})}
            />
            <DropdownMenuDivider />
            <DropdownMenuHint>or drop PSDs and zips anywhere</DropdownMenuHint>
          </>
        }
      />
      {disabled && <p className={addMenuNoteClass}>Import running…</p>}
    </div>
  )
}
