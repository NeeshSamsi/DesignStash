import { createElement } from 'react'
import { toast as sonnerToast } from 'sonner'
import { Toast } from '@renderer/components/Toast'
import type { ToastVariant } from '@renderer/components/Toast/Toast.types'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  variant?: ToastVariant
  message: string
  description?: string
  action?: ToastAction
}

/** Toasts that carry an action stay up a little longer so the action can be reached. */
const ACTION_DURATION_MS = 8000

const KIND_TO_VARIANT = { info: 'neutral', success: 'success', error: 'error' } as const

/**
 * Undo toasts raised while a modal is open sit outside its focus trap, so Tab cannot reach them.
 * ⌘Z runs the newest live one instead (not while typing in a field, where ⌘Z undoes text).
 */
const liveUndos: { id: string | number; run: () => void }[] = []
let hotkeyInstalled = false

function installUndoHotkey() {
  if (hotkeyInstalled || typeof window === 'undefined') return
  hotkeyInstalled = true
  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.metaKey || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z')
        return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      const latest = liveUndos.at(-1)
      if (!latest) return
      event.preventDefault()
      event.stopPropagation()
      latest.run()
    },
    true
  )
}

function forgetUndo(id: string | number) {
  const at = liveUndos.findIndex((entry) => entry.id === id)
  if (at !== -1) liveUndos.splice(at, 1)
}

function show({ variant = 'neutral', message, description, action }: ToastOptions) {
  return sonnerToast.custom(
    (id) => {
      // Fires at most once, then closes: a second click on a fading toast must not repeat the action.
      let fired = false
      const onAction = action
        ? () => {
            if (fired) return
            fired = true
            forgetUndo(id)
            action.onClick()
            sonnerToast.dismiss(id)
          }
        : undefined
      if (onAction && action?.label === 'Undo') {
        installUndoHotkey()
        if (!liveUndos.some((entry) => entry.id === id)) liveUndos.push({ id, run: onAction })
      }
      return createElement(Toast, {
        variant,
        message,
        showDescription: description !== undefined,
        ...(description !== undefined ? { description } : {}),
        action: action !== undefined,
        ...(action ? { actionLabel: action.label } : {}),
        ...(onAction ? { onAction } : {}),
        onClose: () => {
          forgetUndo(id)
          sonnerToast.dismiss(id)
        }
      })
    },
    action
      ? {
          duration: ACTION_DURATION_MS,
          onDismiss: (t: { id: string | number }) => forgetUndo(t.id),
          onAutoClose: (t: { id: string | number }) => forgetUndo(t.id)
        }
      : {}
  )
}

/**
 * Show a toast. The original `toast(message, kind)` form keeps working; pass an options object
 * for a variant, description or action. Rendering is <Toaster /> (ui/sonner.tsx) in AppShell.
 */
export function toast(options: ToastOptions): string | number
export function toast(message: string, kind?: ToastKind): string | number
export function toast(arg: string | ToastOptions, kind: ToastKind = 'info') {
  if (typeof arg === 'string') return show({ variant: KIND_TO_VARIANT[kind], message: arg })
  return show(arg)
}

/** Reversible-action toast: "Moved to Trash · Undo". */
export function undoToast(message: string, onUndo: () => void, description?: string) {
  return show({
    message,
    ...(description !== undefined ? { description } : {}),
    action: { label: 'Undo', onClick: onUndo }
  })
}
