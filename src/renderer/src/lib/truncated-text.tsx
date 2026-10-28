import { useRef, useState, type ElementType } from 'react'
import { cn } from '@renderer/lib/utils'
import { Tooltip } from '@renderer/components/Tooltip'

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
      arrow="bottom-left"
      label={children}
      delayDuration={TRUNCATED_TOOLTIP_MS}
      open={open}
      onOpenChange={(next) => setOpen(next && cut())}
    >
      <Tag ref={ref} className={cn('truncate', className)}>
        {children}
      </Tag>
    </Tooltip>
  )
}
