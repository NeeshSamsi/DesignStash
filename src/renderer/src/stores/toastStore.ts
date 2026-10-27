import { createElement, useEffect, useRef, useState, type ComponentProps } from 'react'
import { toast as sonnerToast } from 'sonner'
import { IPC_CHANNELS } from '@shared/ipc'
import { Toast } from '@renderer/components/Toast'
import type { ToastVariant } from '@renderer/components/Toast/Toast.types'
import { subscribePush } from '@renderer/lib/subscribe'
import { afterUndo } from '@renderer/lib/undo-router'

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

/** Why a toast's Undo is disabled: a newer action touched the same things (design/specs/undo.md). */
export const CHANGED_SINCE = 'Changed since. Use ⌘Z'

/**
 * A toast whose Undo acts on an entry in the app's history. It follows the undo:state push: a newer
 * action that touched the same things disables its Undo and says why, and once the entry has left
 * the history (undone with ⌘Z, or dropped) the toast goes.
 */
function EntryToast({
  toastId,
  entryId,
  description,
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
  return createElement(Toast, {
    ...rest,
    actionDisabled: blocked,
    showDescription: blocked || (showDescription ?? false),
    ...(blocked ? { description: CHANGED_SINCE } : description !== undefined ? { description } : {})
  })
}

/** A toast's Undo for its own entry: main undoes it, out of order when nothing newer touched it. */
async function undoOwnEntry(entryId: number) {
  const res = await window.api.invoke(IPC_CHANNELS.UNDO_ENTRY, { id: entryId }).catch(() => null)
  if (!res?.success) {
    toast({ variant: 'error', message: 'Couldn’t undo that', description: 'Try ⌘Z.' })
    return
  }
  if (res.data.status === 'blocked') toast({ variant: 'error', message: CHANGED_SINCE })
  else afterUndo(res.data, 'undo')
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

function show({ variant = 'neutral', message, description, action, entryId }: ToastOptions) {
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
      const props = {
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
      }
      return entryId === undefined
        ? createElement(Toast, props)
        : createElement(EntryToast, { ...props, toastId: id, entryId })
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

/**
 * Reversible-action toast: "Moved to Trash · Undo". A done action reads as done, so it wears the
 * check. With the entry the action recorded in the app's history (its reply's undoEntryId), Undo
 * undoes that entry (undo:entry); without one, it runs `onUndo`.
 */
export function undoToast(
  message: string,
  onUndo: () => void,
  description?: string,
  entryId?: number
) {
  return show({
    variant: 'success',
    message,
    ...(description !== undefined ? { description } : {}),
    action: {
      label: 'Undo',
      onClick: entryId === undefined ? onUndo : () => void undoOwnEntry(entryId)
    },
    entryId
  })
}
