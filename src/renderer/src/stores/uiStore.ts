import { create } from 'zustand'
import type { IntegrityReport } from '@shared/integrity'

export type AppView = 'library' | 'trash' | 'settings'

export type Modal =
  | { kind: 'detail'; mockupId: number }
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'preview'; coverPath: string }
  | { kind: 'reconcile'; report: IntegrityReport }

interface UiState {
  view: AppView
  modal: Modal | null
  openModal: (modal: Modal) => void
  closeModal: () => void
  setView: (view: AppView) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'library',
  modal: null,
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setView: (view) => set({ view }),
}))
