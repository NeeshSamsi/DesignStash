import { create } from 'zustand'

interface AppState {
  ready: boolean
  setReady: (ready: boolean) => void
}

/** Placeholder global store — proves the Zustand wiring. Real stores land with features. */
export const useAppStore = create<AppState>((set) => ({
  ready: false,
  setReady: (ready) => set({ ready })
}))
