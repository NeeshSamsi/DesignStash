import { create } from 'zustand'

interface DockState {
  /** The top edge of the page's pinned action bar, in window coordinates. Null when there is none. */
  barTop: number | null
  setBarTop: (top: number | null) => void
}

/** What the ActivityDock needs to know about the page: where its pinned action bar starts. */
export const useDockStore = create<DockState>((set) => ({
  barTop: null,
  setBarTop: (barTop) => set((state) => (state.barTop === barTop ? state : { barTop }))
}))
