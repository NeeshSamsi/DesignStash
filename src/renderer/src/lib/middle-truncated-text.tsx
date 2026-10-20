import { useRef, useState, type ElementType } from 'react'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'
import { TRUNCATED_TOOLTIP_MS } from './truncated-text'

/** Names this short stay whole. */
const WHOLE_MAX = 16

/**
 * Splits a name where the cut goes: the head may shrink, the tail never does. The tail is the last
 * third of the name and always holds the extension, so two thirds of the room goes to the start.
 */
export function splitName(name: string): { head: string; tail: string } {
  if (name.length <= WHOLE_MAX) return { head: name, tail: '' }
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.length - dot : 0
  const tail = Math.max(Math.ceil(name.length / 3), extension + 1)
  return { head: name.slice(0, -tail), tail: name.slice(-tail) }
}

export interface MiddleTruncatedTextProps {
  children: string
  /** The element drawn: a heading, a span. */
  as?: ElementType
  className?: string
}

/**
 * A file name that gives up its middle when it does not fit: most of the room goes to the start,
 * and the end (the number, the extension) stays visible. Hovering a cut name shows all of it.
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
