import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  Popover as UiPopover,
  PopoverAnchor,
  PopoverContent,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  popoverPanelVariants
} from '@renderer/ui/popover'
import { Separator } from '@renderer/ui/separator'
import { POPOVER_DEFAULTS, type PopoverContractProps } from './Popover.types'
import { popoverVariants } from './Popover.variants'

export interface PopoverProps extends PopoverContractProps {
  /** The body (Figma's content slot). `content` works too. */
  children?: ReactNode
  /** Header end, e.g. a link Button “Clear all”. */
  headerAction?: ReactNode
  /** The element that opens it. Without it the panel renders in place (catalog). */
  trigger?: ReactNode
  /**
   * The trigger only anchors the panel: clicking it neither opens nor closes it, and `open` says
   * when it shows (a preview that opens on hover or focus of a button that does something else).
   */
  anchored?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  /** Gap between the trigger and the panel, in px. */
  sideOffset?: number
  /** For the live panel: focus and dismiss handlers, pointer events, a measured style. */
  panelProps?: Omit<
    ComponentProps<typeof PopoverContent>,
    'children' | 'size' | 'align' | 'sideOffset' | 'className'
  >
  className?: string
  /** Classes for the body region. */
  bodyClassName?: string
}

const UI_SIZE = { md: 'default', lg: 'lg' } as const

/**
 * Popover — Anchored panel: a header (title, an optional action and description), the body, and a
 * footer of buttons (secondary then primary, heaviest at the right), split by full-width dividers.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-341
 * Adapter over ui/popover.tsx (Figma `md` → shadcn `default`), raised with shadow/raised. A long
 * body scrolls inside its region, so the header and footer stay put.
 */
export function Popover({
  className,
  children,
  headerAction,
  trigger,
  anchored = false,
  open,
  onOpenChange,
  align,
  sideOffset,
  panelProps,
  bodyClassName,
  ...rest
}: PopoverProps) {
  const props = { ...POPOVER_DEFAULTS, ...rest }
  const panel = (
    <>
      {props.header && (
        <>
          <div data-slot="popover-header" className="flex flex-col gap-1 px-4 pt-4 pb-3">
            <PopoverHeader>
              <PopoverTitle>{props.title}</PopoverTitle>
              {headerAction}
            </PopoverHeader>
            {props.showDescription && (
              <p className="type-caption-xs-regular text-muted-foreground">{props.description}</p>
            )}
          </div>
          <Separator />
        </>
      )}
      <div
        data-slot="popover-body"
        className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4', bodyClassName)}
      >
        {children ?? props.content}
      </div>
      {props.footer && (
        <>
          <Separator />
          <PopoverFooter className="gap-3 px-4 py-3">
            {props.secondary}
            {props.primary}
          </PopoverFooter>
        </>
      )}
    </>
  )
  const classes = cn(popoverVariants({ size: props.size }), className)

  if (trigger !== undefined) {
    return (
      <UiPopover
        {...(open !== undefined ? { open } : {})}
        {...(onOpenChange ? { onOpenChange } : {})}
      >
        {anchored ? (
          <PopoverAnchor asChild>{trigger}</PopoverAnchor>
        ) : (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        )}
        <PopoverContent
          data-ds="Popover"
          size={UI_SIZE[props.size]}
          {...(align ? { align } : {})}
          {...(sideOffset !== undefined ? { sideOffset } : {})}
          {...panelProps}
          className={classes}
        >
          {panel}
        </PopoverContent>
      </UiPopover>
    )
  }

  return (
    <div
      data-ds="Popover"
      data-size={props.size}
      className={cn(popoverPanelVariants({ size: UI_SIZE[props.size] }), classes)}
    >
      {panel}
    </div>
  )
}
