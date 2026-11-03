import { useMemo } from 'react'
import type { GridSelection } from '@renderer/hooks/use-grid-selection'
import { useDetailsStore } from '@renderer/stores/detailsStore'

/**
 * The page's selection with the discard ask in front of every change. Selecting another card, a
 * marquee, ⌘A or clearing all leave the mockup being edited, so with unsaved edits they ask first
 * and only go ahead on Discard. Pressing the card that is already showing changes nothing.
 */
export function useGuardedSelection(raw: GridSelection): GridSelection {
  return useMemo(() => {
    const guard = (run: () => void) => useDetailsStore.getState().guard(run)
    return {
      ...raw,
      select: (id, modifiers = {}) => {
        const plain = !modifiers.metaKey && !modifiers.ctrlKey && !modifiers.shiftKey
        const showing = useDetailsStore.getState().target?.id
        if (plain && showing !== undefined && String(showing) === id) raw.select(id, modifiers)
        else guard(() => raw.select(id, modifiers))
      },
      marquee: (hits, base, additive) => guard(() => raw.marquee(hits, base, additive)),
      move: (direction, extend, columns) => guard(() => raw.move(direction, extend, columns)),
      selectAll: () => guard(raw.selectAll),
      clear: () => guard(raw.clear)
    }
  }, [raw])
}
