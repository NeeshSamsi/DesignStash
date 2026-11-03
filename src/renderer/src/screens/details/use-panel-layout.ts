import { useEffect, useRef, useState } from 'react'
import { panelTransition } from '@renderer/lib/panel-transition'
import { usePrefersReducedMotion } from '@renderer/lib/use-reduced-motion'

/**
 * Whether the page is laid out with the details sidebar open. It follows `open` (the selection), but
 * changes inside a view transition so the cards, the main panel and the sidebar morph between the two
 * layouts. Everything that depends on the layout (the sidebar's width, the panel's corner, the grid's
 * columns, the dock's offset) reads this, not `open`, so they all change in the same frame.
 */
export function usePanelLayout(open: boolean): boolean {
  const reduced = usePrefersReducedMotion()
  const [laidOut, setLaidOut] = useState(open)
  const requested = useRef(open)

  useEffect(() => {
    if (requested.current === open) return
    requested.current = open
    panelTransition(() => setLaidOut(open), open ? 'open' : 'close', { reduced })
  }, [open, reduced])

  return laidOut
}
