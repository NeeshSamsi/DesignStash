import { create } from 'zustand'

/**
 * What Detail & edit tells the library page. The page owns the grid and its selection, so Detail
 * only signals: "something changed, reload" and "select these mockups when you show the grid".
 */
interface DetailEffectsState {
  /** Bumps whenever Detail changed something the grid shows (save, star, trash, pile changes). */
  revision: number
  /** Mockups to select in the grid once it has reloaded, e.g. after Disband pile. */
  pendingSelection: number[]
  notifyChanged: () => void
  selectAfterReload: (ids: number[]) => void
  /** Reads the pending selection and clears it. */
  takePendingSelection: () => number[]
}

export const useDetailEffects = create<DetailEffectsState>((set, get) => ({
  revision: 0,
  pendingSelection: [],
  notifyChanged: () => set((state) => ({ revision: state.revision + 1 })),
  selectAfterReload: (ids) => set({ pendingSelection: ids }),
  takePendingSelection: () => {
    const ids = get().pendingSelection
    if (ids.length > 0) set({ pendingSelection: [] })
    return ids
  }
}))
