import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { usePrefersReducedMotion } from '@renderer/lib/use-reduced-motion'

/** The sidebar's share of the window: 380 wide plus its 8px gap and 8px margin (w-99). */
export const PANEL_SHARE = 396
/** The container's closing time (`--duration-panel-container-close`). */
const CONTAINER_CLOSE_MS = 220
/** The container's opening time (`--duration-panel-open`) plus a frame. */
const CONTAINER_OPEN_MS = 300

/** A short dip, 1 → 0.6 → 1, to hide the columns changing. Skipped where the browser cannot animate. */
function dip(el: HTMLElement) {
  if (typeof el.animate !== 'function') return
  el.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 150, easing: 'ease' })
}

/**
 * The page's width while the sidebar comes and goes. Cards must not re-wrap one by one as the
 * container resizes, so the page is held at its final width: narrow the moment the sidebar is
 * asked for, and wide again once the container has finished widening. Both switches dip once. The hold
 * only lasts through the transition; a resize at any other time re-flows the grid as usual.
 * Returns the width to hold (null = free).
 */
export function usePanelGrid(open: boolean, page: RefObject<HTMLElement | null>): number | null {
  const [held, setHeld] = useState<number | null>(null)
  const heldRef = useRef<number | null>(null)
  const still = usePrefersReducedMotion()
  const stillRef = useRef(still)
  useEffect(() => {
    stillRef.current = still
  }, [still])
  const first = useRef(true)

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = page.current
    if (!el) return
    if (open) {
      if (heldRef.current === null) {
        heldRef.current = Math.max(0, el.offsetWidth - PANEL_SHARE)
        setHeld(heldRef.current)
      }
      dip(el)
      // Once the container has settled the page is already at that width: let go, so a resize re-flows it.
      const settle = setTimeout(
        () => {
          heldRef.current = null
          setHeld(null)
        },
        stillRef.current ? 0 : CONTAINER_OPEN_MS
      )
      return () => clearTimeout(settle)
    }
    // Closing: hold the width the page has now while the container widens, then let go.
    if (heldRef.current === null) {
      heldRef.current = el.offsetWidth
      setHeld(heldRef.current)
    }
    const timer = setTimeout(
      () => {
        heldRef.current = null
        setHeld(null)
        if (page.current) dip(page.current)
      },
      stillRef.current ? 0 : CONTAINER_CLOSE_MS
    )
    return () => clearTimeout(timer)
  }, [open, page])

  return held
}
