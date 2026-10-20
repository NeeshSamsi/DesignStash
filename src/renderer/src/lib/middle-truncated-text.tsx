import { useRef, useState, type ElementType } from 'react'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'
import { TRUNCATED_TOOLTIP_MS } from './truncated-text'

/** How much of a name's end always stays in view: enough for a date suffix and the extension. */
export const NAME_TAIL = 12

/** Splits a name where the cut goes: the head may shrink, the tail never does. Short names stay whole. */
export function splitName(name: string, tail = NAME_TAIL): { head: string; tail: string } {
  if (name.length <= tail + 4) return { head: name, tail: '' }
  return { head: name.slice(0, -tail), tail: name.slice(-tail) }
}

export interface MiddleTruncatedTextProps {
  children: string
  /** The element drawn: a heading, a span. */
  as?: ElementType
  className?: string
}

/**
 * A file name that gives up its middle when it does not fit, so the part that tells files apart
 * (the date or number before the extension) stays visible. Hovering a cut name shows all of it.
 */
export function MiddleTruncatedText({
  children,
  as: Tag = 'span',
  className
}: MiddleTruncatedTextProps) {
  const headRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const { head, tail } = splitName(children)
  const cut = () =>
    headRef.current !== null && headRef.current.scrollWidth > headRef.current.clientWidth
  return (
    <Tooltip
      delayDuration={TRUNCATED_TOOLTIP_MS}
      open={open}
      onOpenChange={(next) => setOpen(next && cut())}
    >
      <TooltipTrigger asChild>
        <Tag className={cn('flex min-w-0', className)}>
          <span ref={headRef} className="truncate">
            {head}
          </span>
          {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
        </Tag>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
