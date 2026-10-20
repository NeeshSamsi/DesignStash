import { create } from 'zustand'
import type { IntegrityReport } from '@shared/integrity'

/** `all` and `starred` are My Stash pages; Settings stays a page until it becomes a modal (WP4.6). */
export type AppView = 'all' | 'starred' | 'trash' | 'settings'

export type Modal =
  | { kind: 'detail'; mockupId: number }
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'reconcile'; report: IntegrityReport }

interface UiState {
  view: AppView
  modal: Modal | null
  openModal: (modal: Modal) => void
  closeModal: () => void
  setView: (view: AppView) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'all',
  modal: null,
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setView: (view) => set({ view }),
}))
