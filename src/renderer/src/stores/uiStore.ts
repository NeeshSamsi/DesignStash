import { create } from 'zustand'
import type { DriftReport } from '@shared/integrity'
import type { SettingsLayoutSection } from '../components/SettingsLayout'

/** `all` and `starred` are My Stash pages. Settings is a modal (`settingsOpen`), not a page. */
export type AppView = 'all' | 'starred' | 'to-sort' | 'to-stash' | 'trash'

export type Modal =
  | { kind: 'detail'; mockupId: number }
  /** The stash check's changes. `report` is what the launch check already found, if anything. */
  | { kind: 'reconcile'; report?: DriftReport }

interface UiState {
  view: AppView
  modal: Modal | null
  /** What the title-bar search field shows. The library query follows it after a 250 ms pause. */
  searchText: string
  /** Settings is a modal over whatever page is on show. */
  settingsOpen: boolean
  /** The pane Settings shows. */
  settingsSection: SettingsLayoutSection
  setSettingsSection: (section: SettingsLayoutSection) => void
  /** Opens Settings on a pane; without one it opens on My Stash. */
  openSettings: (section?: SettingsLayoutSection) => void
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
  settingsSection: 'my-stash',
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  openSettings: (section = 'my-stash') => set({ settingsOpen: true, settingsSection: section }),
  closeSettings: () => set({ settingsOpen: false }),
  setSearchText: (searchText) => set({ searchText }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setView: (view) => set({ view })
}))
