import type { CSSProperties } from 'react'

/**
 * The container's side of the details panel's motion: it opens with the panel (the slow duration, settling out)
 * and widens again in 180 ms on the same out curve while the panel leaves in the fast duration. With reduced
 * motion it moves at once.
 */
export function containerTransition(
  property: string,
  open: boolean,
  still: boolean
): CSSProperties {
  if (still) return {}
  return {
    transitionProperty: property,
    transitionDuration: open
      ? 'var(--duration-panel-open)'
      : 'var(--duration-panel-container-close)',
    transitionTimingFunction: 'var(--ease-panel-out)'
  }
}
