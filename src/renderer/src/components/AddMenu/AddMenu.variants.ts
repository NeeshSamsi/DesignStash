import { cva } from 'class-variance-authority'

// Figma AddMenu 218:1767. The trigger is Button (primary, lg); while the menu is open it keeps
// the 2px focus ring. The menu panel is DropdownMenu.
export const addMenuVariants = cva('flex w-full flex-col gap-1', {
  variants: {
    open: { true: '', false: '' },
    disabled: { true: '', false: '' }
  },
  defaultVariants: { open: false, disabled: false }
})

export const addMenuTriggerClass = 'w-full aria-expanded:ring-2 aria-expanded:ring-ring'
export const addMenuNoteClass = 'type-caption-xs-regular text-tertiary'
