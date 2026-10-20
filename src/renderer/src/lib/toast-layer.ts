/**
 * The toast layer (ActivityDock, with Sonner's toaster inside it) sits above every dialog overlay
 * (`z-toast`) and outside the dialog's DOM. Radix counts any press or focus outside a dialog as a
 * dismiss, so a click on a toast's Undo would close the modal underneath. Dialog contents pass
 * their `onInteractOutside` through `guardToaster` so those presses are ignored.
 */
const TOAST_LAYER = '[data-sonner-toaster], [data-ds="ActivityDock"]'

export function isInsideToaster(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TOAST_LAYER) !== null
}

interface OutsideEvent {
  target: EventTarget | null
  detail?: { originalEvent?: Event }
  preventDefault: () => void
}

/** Wraps an `onInteractOutside` / `onPointerDownOutside` / `onFocusOutside` handler. */
export function guardToaster<E extends OutsideEvent>(next?: (event: E) => void) {
  return (event: E) => {
    const origin = event.detail?.originalEvent?.target ?? event.target
    if (isInsideToaster(origin)) {
      event.preventDefault()
      return
    }
    next?.(event)
  }
}
