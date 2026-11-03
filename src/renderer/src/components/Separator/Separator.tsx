import type { ComponentProps } from 'react'
import { Separator as UiSeparator } from '@renderer/ui/separator'
import { SEPARATOR_DEFAULTS, type SeparatorContractProps } from './Separator.types'

export interface SeparatorProps
  extends
    SeparatorContractProps,
    Omit<ComponentProps<typeof UiSeparator>, keyof SeparatorContractProps> {}

/**
 * Separator — Divider line bound to border/subtle.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-87
 * Styles live in ui/separator.tsx.
 */
export function Separator(rest: SeparatorProps) {
  const props = { ...SEPARATOR_DEFAULTS, ...rest }
  return <UiSeparator data-ds="Separator" {...props} />
}
