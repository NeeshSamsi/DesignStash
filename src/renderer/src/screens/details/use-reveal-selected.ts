import { useEffect } from 'react'
import { useDetailsStore } from '@renderer/stores/detailsStore'

/**
 * When the sidebar opens the grid goes from five columns to three and the selected card can end up
 * below the fold. Once the new layout is in, bring it back into view, moving only as far as needed.
 */
export function useRevealSelected(panelOpen: boolean) {
  const id = useDetailsStore((s) => s.target?.id)
  useEffect(() => {
    if (!panelOpen || id === undefined) return
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-mockup-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [panelOpen, id])
}
