import { useEffect } from 'react'
import { useDetailsStore } from '@renderer/stores/detailsStore'

/** Overlays that own Esc while they are up: dialogs, menus, pickers. The card grid's list is not one. */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]:not([data-slot="mockup-cards"])'

/** The cover panel while it replaces a cover; it handles its own Esc. */
const REPLACING =
  '[data-ds="CoverPanel"][data-state="replacing"], [data-ds="CoverPanel"][data-state="uploading"]'

const isField = (el: Element | null) =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLElement && el.isContentEditable)

/**
 * Esc, one step at a time: it closes the sidebar first (asking about unsaved edits), then the pile
 * page goes back to My Stash. Anything else that owns Esc at that moment keeps it: a dialog or
 * menu, or a field outside the sidebar (the search box clears itself). A tag being typed
 * in the sidebar cancels itself first.
 */
export function useDetailsEscape(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const { target, pile } = useDetailsStore.getState()
      if (target === null && pile === null) return
      if (document.querySelector(OVERLAY)) return
      // A cover being replaced: Esc cancels that, and the sidebar stays.
      if (document.querySelector(REPLACING)) return
      const focused = document.activeElement
      const inSidebar = focused?.closest('[data-slot="details-panel"]') != null
      if (isField(focused) && !inSidebar) return
      if (
        inSidebar &&
        focused instanceof HTMLInputElement &&
        focused.value !== '' &&
        focused.closest('[data-ds="TagEditor"]')
      )
        return
      event.stopPropagation()
      event.preventDefault()
      if (target !== null) useDetailsStore.getState().close()
      else useDetailsStore.getState().closePile()
    }
    // Capture, so the grid's own Esc (clear the selection) does not run first and hide the step from us.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
