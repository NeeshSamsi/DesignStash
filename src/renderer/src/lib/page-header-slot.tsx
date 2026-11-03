import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'

interface HeaderSlotState {
  /** The right-hand end of the page header's title row. Null while no header is on show. */
  actionsEl: HTMLElement | null
  setActionsEl: (el: HTMLElement | null) => void
  /** A page's status line ("AI suggestions ready for all 4"), shown under the title. */
  status: string | null
  setStatus: (status: string | null) => void
}

export const useHeaderSlot = create<HeaderSlotState>((set) => ({
  actionsEl: null,
  setActionsEl: (actionsEl) => set({ actionsEl }),
  status: null,
  setStatus: (status) => set({ status })
}))

/**
 * A page's actions, shown right-aligned on the header's title row. Without a header on show
 * (a page mounted on its own) they render where they are placed.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const el = useHeaderSlot((s) => s.actionsEl)
  return el ? createPortal(children, el) : <>{children}</>
}

/** A page's status line, shown under the title next to the description. */
export function useHeaderStatus(status: string | undefined): void {
  useEffect(() => {
    useHeaderSlot.getState().setStatus(status ?? null)
    return () => useHeaderSlot.getState().setStatus(null)
  }, [status])
}
