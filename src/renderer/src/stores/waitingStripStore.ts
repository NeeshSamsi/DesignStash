import { create } from 'zustand'

interface WaitingStripState {
  /** How many were waiting in To sort when "Later" was pressed. Null while the strip is not put off. */
  hiddenAt: number | null
  later: (waiting: number) => void
  /** The haul was sorted down below that count: the next copy brings the strip back. */
  lower: (waiting: number) => void
}

/** "Later" puts the strip off until the next copy lands, or the app relaunches (nothing is saved). */
export const useWaitingStripStore = create<WaitingStripState>((set) => ({
  hiddenAt: null,
  later: (waiting) => set({ hiddenAt: waiting }),
  lower: (waiting) =>
    set((s) => (s.hiddenAt !== null && waiting < s.hiddenAt ? { hiddenAt: waiting } : s))
}))
