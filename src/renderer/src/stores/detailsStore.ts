import { create } from 'zustand'

/** What the details sidebar shows: one mockup (or pile), read-only or as fields. */
export interface DetailsTarget {
  id: number
  edit: boolean
}

/** The pile page: a view inside My Stash that lists one pile's mockups. */
export interface OpenPile {
  id: number
  title: string
  count: number
  /** The mockup selected on arrival: the top one, or the one that was clicked. */
  select: number
  /** Arrive with the sidebar showing that mockup as fields. */
  edit: boolean
}

interface DetailsState {
  /** The sidebar's mockup; null while it is closed. It follows the page's selection. */
  target: DetailsTarget | null
  /** The fields hold edits that are not saved. */
  dirty: boolean
  /** What waits behind the discard ask: the action that would leave the edits. */
  ask: (() => void) | null
  /** How the page on show clears its selection (closing the sidebar clears it too). */
  clearSelection: (() => void) | null
  pile: OpenPile | null
  /** A mockup that should open as fields once the selection reaches it. */
  pendingEdit: number | null

  setClearSelection: (clear: (() => void) | null) => void
  /** The page's selection changed: show this mockup, or close with null. */
  syncTarget: (id: number | null) => void
  /** Show a mockup as fields. The page selects it, which brings the sidebar to it. */
  requestEdit: (id: number) => void
  setEditing: (edit: boolean) => void
  setDirty: (dirty: boolean) => void
  /** Runs `leave` now, or after Discard when there are unsaved edits. */
  guard: (leave: () => void) => void
  confirmDiscard: () => void
  keepEditing: () => void
  /** ✕ and Esc: clears the selection and closes. */
  close: () => void

  openPile: (pile: OpenPile) => void
  updatePile: (pile: Partial<Omit<OpenPile, 'id'>>) => void
  closePile: () => void
}

export const useDetailsStore = create<DetailsState>((set, get) => ({
  target: null,
  dirty: false,
  ask: null,
  clearSelection: null,
  pile: null,
  pendingEdit: null,

  setClearSelection: (clearSelection) => set({ clearSelection }),

  syncTarget: (id) => {
    const { target, pendingEdit } = get()
    if (id === null) {
      if (target !== null) set({ target: null, dirty: false, pendingEdit: null })
      else if (pendingEdit !== null) set({ pendingEdit: null })
      return
    }
    if (target?.id === id) return
    set({ target: { id, edit: pendingEdit === id }, dirty: false, pendingEdit: null })
  },

  requestEdit: (id) => {
    const { target } = get()
    if (target?.id === id) {
      if (!target.edit) set({ target: { id, edit: true } })
      return
    }
    set({ pendingEdit: id })
  },

  setEditing: (edit) => {
    const { target } = get()
    if (!target || target.edit === edit) return
    set({ target: { ...target, edit }, dirty: false })
  },

  setDirty: (dirty) => {
    if (get().dirty !== dirty) set({ dirty })
  },

  guard: (leave) => {
    if (get().dirty) set({ ask: leave })
    else leave()
  },

  confirmDiscard: () => {
    const { ask } = get()
    set({ ask: null, dirty: false })
    ask?.()
  },

  keepEditing: () => set({ ask: null }),

  close: () => {
    get().guard(() => {
      get().clearSelection?.()
      get().syncTarget(null)
    })
  },

  openPile: (pile) => set({ pile }),
  updatePile: (patch) => {
    const { pile } = get()
    if (pile) set({ pile: { ...pile, ...patch } })
  },
  closePile: () => {
    set({ pile: null, target: null, dirty: false, pendingEdit: null })
  }
}))
