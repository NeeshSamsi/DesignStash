import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  DROP_OVERLAY_CONTRACT,
  DROP_OVERLAY_DEFAULTS,
  type DropOverlayContractProps
} from './DropOverlay.types'
import { dropOverlayVariants } from './DropOverlay.variants'

export interface DropOverlayProps extends DropOverlayContractProps {
  className?: string
}

/**
 * DropOverlay — Full-window drag-over state; rejected = no PSDs; queued = import already running.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1990
 * Today: App.tsx drag handlers
 */
export function DropOverlay({ className, ...rest }: DropOverlayProps) {
  const props = { ...DROP_OVERLAY_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="DropOverlay" on the root element.
  return (
    <ScaffoldStub
      contract={DROP_OVERLAY_CONTRACT}
      props={props}
      className={cn(dropOverlayVariants({ state: props.state }), className)}
    />
  )
}
