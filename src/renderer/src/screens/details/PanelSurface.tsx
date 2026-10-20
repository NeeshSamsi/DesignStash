import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { usePrefersReducedMotion } from '@renderer/lib/use-reduced-motion'

/** How long the panel takes to leave (`--duration-panel-close`), plus a frame to be safe. */
export const PANEL_LEAVE_MS = 200

export interface PanelSurfaceProps {
  /** Whether the sidebar is asked for. It slides in when true and leaves when false. */
  open: boolean
  /** What to show. Kept on screen while the panel leaves, so give it the last content, not null. */
  children: ReactNode
  className?: string
}

/** The slide: one block from the right, 40 ms behind the container, fading in over its first 100 ms. */
function motion(open: boolean, still: boolean): CSSProperties {
  if (still) return { transition: 'opacity 150ms linear' }
  return open
    ? {
        transition: 'transform 260ms var(--ease-panel-out) 40ms, opacity 100ms linear 40ms'
      }
    : {
        transition:
          'transform var(--duration-panel-close) var(--ease-panel-in), opacity var(--duration-panel-close) var(--ease-panel-in)'
      }
}

/**
 * PanelSurface — the details sidebar's own surface: surface-1, top corners 24, padding 20 (one step under Figma's 24).
 * Figma: D2.3 B1 / B3, details-panel (872:42395). Only the surface moves: nothing inside it animates.
 * It stays mounted while it leaves, then drops its content.
 */
export function PanelSurface({ open, children, className }: PanelSurfaceProps) {
  const still = usePrefersReducedMotion()
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const frame = useRef(0)

  // Mounting and resetting the slide follow `open` while rendering; the timers below only run later.
  if (open && !mounted) setMounted(true)
  if (!open && entered) setEntered(false)

  useEffect(() => {
    if (open) {
      // One frame at the start position, so the slide has somewhere to come from.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => setEntered(true))
      })
      return () => cancelAnimationFrame(frame.current)
    }
    const timer = setTimeout(() => setMounted(false), PANEL_LEAVE_MS)
    return () => clearTimeout(timer)
  }, [open])

  if (!mounted) return null
  return (
    <div
      data-slot="details-panel"
      data-open={open}
      className={cn(
        'flex h-full w-95 flex-col gap-5 overflow-hidden rounded-t-3xl bg-surface-1 p-5',
        !still && !entered && 'translate-x-99',
        !entered && 'opacity-0',
        className
      )}
      style={motion(open, still)}
    >
      {children}
    </div>
  )
}
