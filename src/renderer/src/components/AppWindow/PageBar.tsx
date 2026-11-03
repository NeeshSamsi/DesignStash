import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { pageBarClass, SCROLL_EDGE_BLUR_LAYERS } from './AppWindow.variants'

/**
 * A page's own bar under the header, such as the My Stash toolbar. It stays at the top of the page's
 * scroll area on the panel colour while the content scrolls under it, with the scroll edge below it.
 * A page has at most one. Without one, the frame shows the edge right under the header.
 */
export function PageBar({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // The scroll area learns how tall the bar is (`page-scroll` in main.css).
  useLayoutEffect(() => {
    const bar = ref.current
    const scroll = bar?.closest<HTMLElement>('[data-slot="page-scroll"]')
    if (!bar || !scroll || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() =>
      scroll.style.setProperty('--page-bar-height', `${bar.offsetHeight}px`)
    )
    observer.observe(bar)
    return () => {
      observer.disconnect()
      scroll.style.removeProperty('--page-bar-height')
    }
  }, [])
  return (
    <div ref={ref} data-slot="page-bar" data-page-bar className={cn(pageBarClass, className)}>
      {children}
      <ScrollEdge />
    </div>
  )
}

/**
 * The soft edge under a page's fixed header. Content passing under it blurs and fades into the panel
 * over a tall, eased band, the way macOS toolbars do, so it never meets the header at a hard line. It
 * shows only while its bar is stuck, so at the top of the scroll the first row is never dimmed. With
 * Reduce transparency on it is a plain fade. The look lives in main.css (`.ds-scroll-edge`).
 */
export function ScrollEdge() {
  return (
    <div aria-hidden data-slot="scroll-edge" className="ds-scroll-edge">
      {Array.from({ length: SCROLL_EDGE_BLUR_LAYERS }, (_, layer) => (
        <div key={layer} className="ds-scroll-edge-blur" />
      ))}
      <div className="ds-scroll-edge-fade" />
    </div>
  )
}
