/** The gap the ActivityDock keeps from the window edge, and above a pinned action bar. */
export const DOCK_GAP = 16

/** How long a finished copy's summary stays, the same as an action toast. */
export const SUMMARY_MS = 6000

/**
 * How far the dock (the copy widget and the toasts) sits above the bottom of the window. With a
 * pinned action bar on the page it clears the bar's top by the gap; without one it keeps the
 * normal margin. It never gets closer to the edge than the gap.
 */
export function dockBottom(barTop: number | null, viewportHeight: number): number {
  if (barTop === null) return DOCK_GAP
  return Math.max(DOCK_GAP, Math.round(viewportHeight - barTop) + DOCK_GAP)
}
