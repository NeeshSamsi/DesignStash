import { create } from 'zustand'
import type { IntegrityReport } from '@shared/integrity'

/** `all` and `starred` are My Stash pages; Settings stays a page until it becomes a modal (WP4.6). */
export type AppView = 'all' | 'starred' | 'to-sort' | 'to-stash' | 'trash' | 'settings'

export type Modal =
  | { kind: 'detail'; mockupId: number }
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'reconcile'; report: IntegrityReport }

interface UiState {
  view: AppView
  modal: Modal | null
  /** What the title-bar search field shows. The library query follows it after a 250 ms pause. */
  searchText: string
  setSearchText: (text: string) => void
  openModal: (modal: Modal) => void
  closeModal: () => void
  setView: (view: AppView) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'all',
  modal: null,
  searchText: '',
  setSearchText: (searchText) => set({ searchText }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setView: (view) => set({ view })
}))
