import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SCROLL_AREA_CONTRACT,
  SCROLL_AREA_DEFAULTS,
  type ScrollAreaContractProps
} from './ScrollArea.types'
import { scrollAreaVariants } from './ScrollArea.variants'

export interface ScrollAreaProps extends ScrollAreaContractProps {
  className?: string
}

/**
 * ScrollArea — Styled scroll region with a thin rounded thumb.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-101
 * Today: ui/scroll-area.tsx
 */
export function ScrollArea({ className, ...rest }: ScrollAreaProps) {
  const props = { ...SCROLL_AREA_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ScrollArea" on the root element.
  return (
    <ScaffoldStub
      contract={SCROLL_AREA_CONTRACT}
      props={props}
      className={cn(scrollAreaVariants(), className)}
    />
  )
}
