import { create } from 'zustand'
import type { IntegrityReport } from '@shared/integrity'

/** `all` and `starred` are My Stash pages. Settings is a modal (`settingsOpen`), not a page. */
export type AppView = 'all' | 'starred' | 'to-sort' | 'to-stash' | 'trash'

export type Modal =
  | { kind: 'detail'; mockupId: number }
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'reconcile'; report: IntegrityReport }

interface UiState {
  view: AppView
  modal: Modal | null
  /** What the title-bar search field shows. The library query follows it after a 250 ms pause. */
  searchText: string
  /** Settings is a modal over whatever page is on show. */
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  setSearchText: (text: string) => void
  openModal: (modal: Modal) => void
  closeModal: () => void
  setView: (view: AppView) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'all',
  modal: null,
  searchText: '',
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setSearchText: (searchText) => set({ searchText }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setView: (view) => set({ view })
}))
