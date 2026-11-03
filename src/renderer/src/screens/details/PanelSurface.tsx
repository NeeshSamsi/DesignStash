import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export interface PanelSurfaceProps {
  /** Whether the sidebar is on screen. It is removed the moment this is false. */
  open: boolean
  /** What to show. */
  children: ReactNode
  className?: string
}

/**
 * PanelSurface — the details sidebar's own surface: surface-1, top corners 24, padding 20.
 * Figma: D2.3 B1 / B3, details-panel (872:42395). It moves as one block and nothing inside it animates:
 * the slide in and out is the view transition on its name (lib/panel-transition.ts,
 * styles/details-transition.css), so the surface itself only has to appear and disappear.
 */
export function PanelSurface({ open, children, className }: PanelSurfaceProps) {
  if (!open) return null
  return (
    <div
      data-slot="details-panel"
      className={cn(
        'flex h-full w-95 flex-col gap-5 overflow-hidden rounded-t-3xl bg-surface-1 p-5',
        className
      )}
      style={{ viewTransitionName: 'details-panel' }}
    >
      {children}
    </div>
  )
}
