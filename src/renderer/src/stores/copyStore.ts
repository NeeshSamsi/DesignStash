import { create } from 'zustand'
import type { CopyFile, CopyProgress, CopyStatus } from '@shared/ipc/import'

interface CopyState {
  /** The haul on show: running, paused, just finished or stopped. Null when there is nothing to show. */
  haul: CopyStatus | null
  view: 'expanded' | 'collapsed'
  /** The haul was dismissed or resolved; a pushed update for it does not bring it back. */
  hiddenId: string | null
  setHaul(haul: CopyStatus | null): void
  /** Folds a pushed update into the haul on show. */
  applyProgress(progress: CopyProgress): void
  toggleView(): void
  dismiss(): void
  reset(): void
}

const merge = (files: readonly CopyFile[], next: CopyFile | null): CopyFile[] => {
  if (!next) return [...files]
  const found = files.some((f) => f.jobId === next.jobId)
  return found ? files.map((f) => (f.jobId === next.jobId ? next : f)) : [...files, next]
}

/** The copy widget's state. Main owns the queue; this only mirrors what it pushes. */
export const useCopyStore = create<CopyState>((set) => ({
  haul: null,
  view: 'expanded',
  hiddenId: null,
  setHaul: (haul) => set({ haul, hiddenId: null }),
  applyProgress: (progress) =>
    set((state) => {
      const { file, ...counts } = progress
      if (state.hiddenId === counts.haulId) return state
      const previous = state.haul?.haulId === counts.haulId ? state.haul.files : []
      // A different haul than the one hidden: show it again, opened.
      const reopened = state.haul?.haulId === counts.haulId ? state.view : 'expanded'
      return {
        haul: { ...counts, files: merge(previous, file) },
        view: counts.state === 'done' ? 'collapsed' : reopened,
        hiddenId: null
      }
    }),
  toggleView: () => set((s) => ({ view: s.view === 'expanded' ? 'collapsed' : 'expanded' })),
  dismiss: () => set((s) => ({ hiddenId: s.haul?.haulId ?? null, haul: null })),
  reset: () => set({ haul: null, view: 'expanded', hiddenId: null })
}))
