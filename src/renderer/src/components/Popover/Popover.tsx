import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  Popover as UiPopover,
  PopoverContent,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  popoverPanelVariants
} from '@renderer/ui/popover'
import { POPOVER_DEFAULTS, type PopoverContractProps } from './Popover.types'
import { popoverVariants } from './Popover.variants'

export interface PopoverProps extends PopoverContractProps {
  /** Panel content (Figma's content slot). */
  children?: ReactNode
  /** Header end, e.g. a link Button “Clear all”. */
  headerAction?: ReactNode
  /** Footer row content, end-aligned (shown when `footer`). */
  footerContent?: ReactNode
  /** The element that opens it. Without it the panel renders in place (catalog). */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  className?: string
}

const UI_SIZE = { md: 'default', lg: 'lg' } as const

/**
 * Popover — Anchored panel (tag filter, tag suggestions).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-341
 * Adapter over ui/popover.tsx (Figma `md` → shadcn `default`).
 */
export function Popover({
  className,
  children,
  headerAction,
  footerContent,
  trigger,
  open,
  onOpenChange,
  align,
  ...rest
}: PopoverProps) {
  const props = { ...POPOVER_DEFAULTS, ...rest }
  const panel = (
    <>
      {props.header && (
        <PopoverHeader>
          <PopoverTitle>{props.title}</PopoverTitle>
          {headerAction}
        </PopoverHeader>
      )}
      {children}
      {props.footer && <PopoverFooter>{footerContent}</PopoverFooter>}
    </>
  )
  const classes = cn(popoverVariants({ size: props.size }), className)

  if (trigger !== undefined) {
    return (
      <UiPopover
        {...(open !== undefined ? { open } : {})}
        {...(onOpenChange ? { onOpenChange } : {})}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          data-ds="Popover"
          size={UI_SIZE[props.size]}
          {...(align ? { align } : {})}
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
