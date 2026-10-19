import type { ComponentProps } from 'react'
import { ScrollArea as UiScrollArea } from '@renderer/ui/scroll-area'
import { SCROLL_AREA_DEFAULTS, type ScrollAreaContractProps } from './ScrollArea.types'

export interface ScrollAreaProps
  extends ScrollAreaContractProps,
    ComponentProps<typeof UiScrollArea> {}

/**
 * ScrollArea — Styled scroll region with a thin rounded thumb.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-101
 * Styles live in ui/scroll-area.tsx. Figma's surface-2 box with a subtle border is the specimen
 * frame around the demo rows; the region itself is unstyled so it can sit inside any surface.
 */
export function ScrollArea(rest: ScrollAreaProps) {
  const props = { ...SCROLL_AREA_DEFAULTS, ...rest }
  return <UiScrollArea data-ds="ScrollArea" {...props} />
}
