import { useCallback, useRef } from 'react'
import { useDockStore } from '@renderer/stores/dockStore'

/**
 * For a page with a pinned action bar: put the returned ref on the bar's wrapper and the dock keeps
 * clear of it. The top edge is measured again on resize, scroll and when the bar changes size.
 */
export function usePinnedBar(): (node: HTMLElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((node: HTMLElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    const { setBarTop } = useDockStore.getState()
    if (!node) return setBarTop(null)

    const measure = () => setBarTop(Math.round(node.getBoundingClientRect().top))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    // The bar is sticky, so scrolling the page can move it; capture catches the page's own scroller.
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    cleanup.current = () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, { capture: true })
      setBarTop(null)
    }
  }, [])
}
