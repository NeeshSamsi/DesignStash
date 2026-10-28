import { createElement, useEffect, useRef, useState, type ComponentProps } from 'react'
import { toast as sonnerToast } from 'sonner'
import { IPC_CHANNELS } from '@shared/ipc'
import { Toast } from '@renderer/components/Toast'
import type { ToastVariant } from '@renderer/components/Toast/Toast.types'
import { subscribePush } from '@renderer/lib/subscribe'
import { undoEntry } from '@renderer/lib/undo-router'

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
  /** The app-history entry its Undo acts on: the toast follows whether that's still allowed. */
  entryId?: number | undefined
}

/**
 * A toast whose Undo acts on an entry in the app's history. It follows the undo:state push: a newer
 * action that touched the same things disables its Undo and says why, and once the entry has left
 * the history (undone with ⌘Z, or dropped) the toast goes.
 */
function EntryToast({
  toastId,
  entryId,
  showDescription,
  ...rest
}: ComponentProps<typeof Toast> & { toastId: string | number; entryId: number }) {
  const [blocked, setBlocked] = useState(false)
  const listed = useRef(false)
  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.UNDO_STATE, (state) => {
        const entry = state.entries.find((e) => e.id === entryId)
        if (entry) {
          listed.current = true
          setBlocked(entry.blockedBy !== undefined)
        } else if (listed.current) {
          sonnerToast.dismiss(toastId)
        }
      }),
    [entryId, toastId]
  )
  // A blocked toast says why itself (the Toast's action-disabled state).
  return createElement(Toast, {
    ...rest,
    actionDisabled: blocked,
    showDescription: showDescription ?? false
  })
}

/** Toasts that carry an action stay up a little longer so the action can be reached. */
const ACTION_DURATION_MS = 8000

const KIND_TO_VARIANT = { info: 'neutral', success: 'success', error: 'error' } as const

function show({ variant = 'neutral', message, description, action, entryId }: ToastOptions) {
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
      const props = {
        variant,
        message,
        showDescription: description !== undefined,
        ...(description !== undefined ? { description } : {}),
        action: action !== undefined,
        ...(action ? { actionLabel: action.label } : {}),
        ...(onAction ? { onAction } : {}),
        onClose: () => sonnerToast.dismiss(id)
      }
      return entryId === undefined
        ? createElement(Toast, props)
        : createElement(EntryToast, { ...props, toastId: id, entryId })
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

/**
 * Reversible-action toast: "Moved to Trash · Undo". A done action reads as done, so it wears the
 * check. Its Undo undoes the entry the action recorded in the app's history (its reply's
 * undoEntryId, through undo:entry). An action that recorded none changed nothing worth undoing,
 * so its toast has no Undo.
 */
export function undoToast(message: string, entryId: number | undefined, description?: string) {
  return show({
    variant: 'success',
    message,
    ...(description !== undefined ? { description } : {}),
    ...(entryId !== undefined
      ? { action: { label: 'Undo', onClick: () => void undoEntry(entryId) }, entryId }
      : {})
  })
}

/**
 * A step in an open flow, outside the app's history (the Sort board's "New pile of 2 · Undo"):
 * Undo runs `onUndo`, the flow's own step back.
 */
export function stepToast(message: string, onUndo: () => void) {
  return show({ variant: 'success', message, action: { label: 'Undo', onClick: onUndo } })
}
