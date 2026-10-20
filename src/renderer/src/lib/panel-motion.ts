import type { CSSProperties } from 'react'

/**
 * The container's side of the details panel's motion: it opens with the panel (280 ms, settling out)
 * and closes a little slower than the panel leaves (220 ms, in and out). With reduced motion it
 * moves at once.
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
    transitionTimingFunction: open ? 'var(--ease-panel-out)' : 'var(--ease-panel-inout)'
  }
}
