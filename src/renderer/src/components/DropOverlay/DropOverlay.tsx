import { ICON_STROKE } from '@renderer/design-system/icon'
import { Clock01Icon, FileNotFoundIcon, Upload01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { DROP_OVERLAY_DEFAULTS, type DropOverlayContractProps } from './DropOverlay.types'
import {
  dropOverlayIconVariants,
  dropOverlayVariants,
  dropOverlayZoneVariants
} from './DropOverlay.variants'

export interface DropOverlayProps extends DropOverlayContractProps {
  className?: string
}

const ICONS = {
  'drag-over': Upload01Icon,
  rejected: FileNotFoundIcon,
  queued: Clock01Icon
} as const

/**
 * DropOverlay — Full-window drag-over state; rejected = no PSDs; queued = import already running.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1990
 * Fills the nearest positioned ancestor (AppWindow). Drag handling lives in the app, not here.
 */
export function DropOverlay({ className, ...rest }: DropOverlayProps) {
  const props = { ...DROP_OVERLAY_DEFAULTS, ...rest }
  return (
    <div
      data-ds="DropOverlay"
      data-state={props.state}
      role={props.state === 'rejected' ? 'alert' : 'status'}
      className={cn(dropOverlayVariants({ state: props.state }), className)}
    >
      <div className={dropOverlayZoneVariants({ state: props.state })}>
        <div className="flex size-16 items-center justify-center rounded-xl bg-surface-2">
          <HugeiconsIcon
            icon={ICONS[props.state]}
            strokeWidth={ICON_STROKE}
            className={dropOverlayIconVariants({ state: props.state })}
          />
        </div>
        <p className="type-display-2xl-medium text-foreground">{props.title}</p>
        <p className="type-body-sm-regular text-muted-foreground">{props.description}</p>
      </div>
    </div>
  )
}
