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

function show({ variant = 'neutral', message, description, action }: ToastOptions) {
  return sonnerToast.custom(
    (id) => {
      // Fires at most once, then closes: a second click on a fading toast must not repeat the action.
      let fired = false
      const onAction = action
        ? () => {
            if (fired) return
            fired = true
            action.onClick()
            sonnerToast.dismiss(id)
          }
        : undefined
      return createElement(Toast, {
        variant,
        message,
        showDescription: description !== undefined,
        ...(description !== undefined ? { description } : {}),
        action: action !== undefined,
        ...(action ? { actionLabel: action.label } : {}),
        ...(onAction ? { onAction } : {}),
        onClose: () => sonnerToast.dismiss(id)
      })
    },
    action ? { duration: ACTION_DURATION_MS } : {}
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
