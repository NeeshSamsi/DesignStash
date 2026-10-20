import { useRef, useState, type ElementType } from 'react'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'

/** How long a hover waits before the full text shows. */
export const TRUNCATED_TOOLTIP_MS = 600

export interface TruncatedTextProps {
  children: string
  /** The element drawn: a heading, a span. */
  as?: ElementType
  className?: string
}

/**
 * Text that ends in an ellipsis when it does not fit. Hovering it shows the whole text after the
 * usual tooltip delay, and only when it really is cut off.
 */
export function TruncatedText({ children, as: Tag = 'span', className }: TruncatedTextProps) {
  const ref = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const cut = () => ref.current !== null && ref.current.scrollWidth > ref.current.clientWidth
  return (
    <Tooltip
      delayDuration={TRUNCATED_TOOLTIP_MS}
      open={open}
      onOpenChange={(next) => setOpen(next && cut())}
    >
      <TooltipTrigger asChild>
        <Tag ref={ref} className={cn('truncate', className)}>
          {children}
        </Tag>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
