import { create } from 'zustand'

export interface ToastItem {
  id: string
  message: string
  kind: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: ToastItem[]
  addToast: (message: string, kind?: ToastItem['kind']) => void
  removeToast: (id: string) => void
}

let _counter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, kind = 'info') => {
    const id = `toast-${++_counter}`
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3500)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(message: string, kind: ToastItem['kind'] = 'info') {
  useToastStore.getState().addToast(message, kind)
}
