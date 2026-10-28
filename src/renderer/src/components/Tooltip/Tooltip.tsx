import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
  tooltipArrowClass,
  tooltipBodyClass
} from '@renderer/ui/tooltip'
import { TOOLTIP_DEFAULTS, type TooltipArrow, type TooltipContractProps } from './Tooltip.types'
import { tooltipArrowTrackVariants, tooltipVariants } from './Tooltip.variants'

export interface TooltipProps extends TooltipContractProps {
  /** The element the tooltip labels. Without it the tooltip renders in place (catalog). */
  children?: ReactNode
  className?: string
  /** Controlled: the caller says when it shows (a cut-off title opens only when cut off). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** How long a hover waits before it opens, in ms. Focus opens it at once. */
  delayDuration?: number
}

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

/**
 * Figma names the edge (and end) of the body the pointer sits on. The body therefore sits on
 * the opposite side of the trigger: `arrow=top-left` → below it, aligned to its start.
 */
export function tooltipPlacement(arrow: TooltipArrow): { side: Side; align: Align } {
  if (arrow === 'none') return { side: 'top', align: 'center' }
  const [edge, end] = arrow.split('-') as [Side, Side | undefined]
  const side = ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const)[edge]
  const align: Align = !end ? 'center' : end === 'left' || end === 'top' ? 'start' : 'end'
  return { side, align }
}

/**
 * Tooltip — Labels icon buttons and explains disabled actions. arrow = edge + end of the body the pointer sits on.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=232-4742
 * Adapter over ui/tooltip.tsx: `arrow` becomes Radix side + align.
 */
export function Tooltip({
  className,
  children,
  open,
  onOpenChange,
  delayDuration,
  ...rest
}: TooltipProps) {
  const props = { ...TOOLTIP_DEFAULTS, ...rest }
  const body = (
    <>
      <span>{props.label}</span>
      {props.showShortcut && props.shortcut}
    </>
  )

  if (children !== undefined) {
    const { side, align } = tooltipPlacement(props.arrow)
    return (
      <UiTooltip
        {...(open !== undefined ? { open } : {})}
        {...(onOpenChange ? { onOpenChange } : {})}
        {...(delayDuration !== undefined ? { delayDuration } : {})}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          data-ds="Tooltip"
          side={side}
          align={align}
          showArrow={props.arrow !== 'none'}
          className={className}
        >
          {body}
        </TooltipContent>
      </UiTooltip>
    )
  }

  const edge = props.arrow === 'none' ? undefined : (props.arrow.split('-')[0] as Side)
  return (
    <div
      data-ds="Tooltip"
      data-arrow={props.arrow}
      role="tooltip"
      className={cn(tooltipVariants({ arrow: props.arrow }), className)}
    >
      <div className={tooltipBodyClass}>{body}</div>
      {edge && (
        <span aria-hidden className={tooltipArrowTrackVariants({ arrow: props.arrow })}>
          <span className={cn(tooltipArrowClass, EDGE_SHIFT[edge])} />
        </span>
      )}
    </div>
  )
}

/** Moves the square so its centre sits on the body's edge (the track clips the far half). */
const EDGE_SHIFT: Record<Side, string> = {
  top: 'translate-y-1/2',
  bottom: '-translate-y-1/2',
  left: 'translate-y-0 translate-x-1/2',
  right: 'translate-y-0 -translate-x-1/2'
}
