import { create } from 'zustand'
import type { ApprovalItem, ApprovalQueue } from '@shared/approval'

interface ApprovalState {
  batchId: string | null
  queue: ApprovalItem[]
  currentIndex: number
  manuallyEditedIds: Set<number>
  isInitializing: boolean
  isSaving: boolean
  isComplete: boolean

  currentItem(): ApprovalItem | null
  totalItems(): number

  setQueue(queue: ApprovalQueue): void
  updateCurrentItem(
    updates: Partial<Pick<ApprovalItem, 'title' | 'description' | 'tags' | 'coverPath' | 'coverSource' | 'sidecarFileName'>>
  ): void
  markCurrentManuallyEdited(): void
  applyReinferred(items: ApprovalItem[]): void
  goNext(): void
  goBack(): void
  setInitializing(v: boolean): void
  setSaving(v: boolean): void
  setComplete(): void
  reset(): void
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  batchId: null,
  queue: [],
  currentIndex: 0,
  manuallyEditedIds: new Set(),
  isInitializing: false,
  isSaving: false,
  isComplete: false,

  currentItem: () => get().queue[get().currentIndex] ?? null,
  totalItems: () => get().queue.length,

  setQueue(queue) {
    set({
      batchId: queue.batchId,
      queue: queue.items,
      currentIndex: 0,
      manuallyEditedIds: new Set(),
      isComplete: false
    })
  },

  updateCurrentItem(updates) {
    set((state) => {
      const item = state.queue[state.currentIndex]
      if (!item) return state
      const updated = { ...item, ...updates }
      const newQueue = [...state.queue]
      newQueue[state.currentIndex] = updated
      return { queue: newQueue }
    })
  },

  markCurrentManuallyEdited() {
    set((state) => {
      const item = state.queue[state.currentIndex]
      if (!item) return state
      const next = new Set(state.manuallyEditedIds)
      next.add(item.mockupId)
      return { manuallyEditedIds: next }
    })
  },

  applyReinferred(items) {
    set((state) => {
      const byId = new Map(items.map((i) => [i.mockupId, i]))
      const newQueue = state.queue.map((item) => {
        if (state.manuallyEditedIds.has(item.mockupId)) return item
        const reinferred = byId.get(item.mockupId)
        return reinferred ?? item
      })
      return { queue: newQueue }
    })
  },

  goNext() {
    set((state) => {
      if (state.currentIndex < state.queue.length - 1) {
        return { currentIndex: state.currentIndex + 1 }
      }
      return state
    })
  },

  goBack() {
    set((state) => {
      if (state.currentIndex > 0) {
        return { currentIndex: state.currentIndex - 1 }
      }
      return state
    })
  },

  setInitializing(v) {
    set({ isInitializing: v })
  },

  setSaving(v) {
    set({ isSaving: v })
  },

  setComplete() {
    set({ isComplete: true })
  },

  reset() {
    set({
      batchId: null,
      queue: [],
      currentIndex: 0,
      manuallyEditedIds: new Set(),
      isInitializing: false,
      isSaving: false,
      isComplete: false
    })
  }
}))
