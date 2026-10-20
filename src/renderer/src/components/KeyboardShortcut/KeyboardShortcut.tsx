import type { ComponentProps } from 'react'
import { Kbd } from '@renderer/ui/kbd'
import {
  KEYBOARD_SHORTCUT_DEFAULTS,
  type KeyboardShortcutContractProps
} from './KeyboardShortcut.types'

export interface KeyboardShortcutProps
  extends
    KeyboardShortcutContractProps,
    Omit<ComponentProps<'kbd'>, keyof KeyboardShortcutContractProps> {}

/**
 * KeyboardShortcut — Shortcut hint; boxed in inputs/palettes, plain in menus and tooltips.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-41
 * Styles live in ui/kbd.tsx; this maps the Figma props onto it (boxed → default).
 */
export function KeyboardShortcut(rest: KeyboardShortcutProps) {
  const { variant, keys, ...props } = { ...KEYBOARD_SHORTCUT_DEFAULTS, ...rest }
  return (
    <Kbd data-ds="KeyboardShortcut" variant={variant === 'boxed' ? 'default' : 'plain'} {...props}>
      {keys}
    </Kbd>
  )
}
