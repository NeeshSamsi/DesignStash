import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  KEYBOARD_SHORTCUT_CONTRACT,
  KEYBOARD_SHORTCUT_DEFAULTS,
  type KeyboardShortcutContractProps
} from './KeyboardShortcut.types'
import { keyboardShortcutVariants } from './KeyboardShortcut.variants'

export interface KeyboardShortcutProps extends KeyboardShortcutContractProps {
  className?: string
}

/**
 * KeyboardShortcut — Shortcut hint; boxed in inputs/palettes, plain in menus and tooltips.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-41
 * Today: ui/kbd.tsx (variant="default" ↔ boxed)
 */
export function KeyboardShortcut({ className, ...rest }: KeyboardShortcutProps) {
  const props = { ...KEYBOARD_SHORTCUT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="KeyboardShortcut" on the root element.
  return (
    <ScaffoldStub
      contract={KEYBOARD_SHORTCUT_CONTRACT}
      props={props}
      className={cn(keyboardShortcutVariants({ variant: props.variant }), className)}
    />
  )
}
