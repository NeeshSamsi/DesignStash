import { useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { RendererUndoOp, UndoContext, UndoRunResult } from '@shared/ipc/undo'
import { CHANGED_SINCE } from '@renderer/components/Toast'
import { toast } from '@renderer/stores/toastStore'
import { subscribePush } from './subscribe'

/**
 * Where ⌘Z and Edit › Undo go (design/specs/undo.md, The rule): the innermost context. A focused
 * text field undoes its own typing, an open flow (Sort, Look it over) its own last step, and
 * anywhere else the app's history in main. ⇧⌘Z and Edit › Redo go to the same one.
 */

export type UndoDirection = 'undo' | 'redo'
export type { UndoContext }

/** An open flow's own steps: Sort's board, Look it over's step list. */
export interface FlowUndo {
  undo(): void
  redo(): void
}

/** Open flows, newest last. Only the newest takes ⌘Z; the one under it takes over when it closes. */
const flows: { current: FlowUndo }[] = []

/** Told when focus or the open flows may have moved ⌘Z's context. */
const contextListeners = new Set<() => void>()
const contextMayHaveChanged = () => contextListeners.forEach((listener) => listener())

/** Inputs nobody types in, so they have no typing to undo. */
const UNTYPED = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit'
])

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && !UNTYPED.has(el.type)
}

/** The context ⌘Z would act on right now. */
export function undoContext(): UndoContext {
  if (isTextField(document.activeElement)) return 'field'
  return flows.length > 0 ? 'flow' : 'app'
}

export interface UndoRoutes {
  /** The app's history in main (`undo:run`, `redo:run`). */
  app: (direction: UndoDirection) => Promise<void>
  /** A field the page couldn't undo in: main's `webContents.undo()` or `redo()`. */
  fieldFallback: (direction: UndoDirection) => Promise<void>
}

/** Sends one undo or redo to the innermost context, and says which it went to. */
export async function routeUndo(
  direction: UndoDirection,
  routes: UndoRoutes
): Promise<UndoContext> {
  const context = undoContext()
  if (context === 'field') {
    const done = typeof document.execCommand === 'function' && document.execCommand(direction)
    if (!done) await routes.fieldFallback(direction)
  } else if (context === 'flow') {
    flows[flows.length - 1]!.current[direction]()
  } else {
    await routes.app(direction)
  }
  return context
}

/** An open flow takes ⌘Z and ⇧⌘Z for its own steps while it is mounted. */
export function useFlowUndo(steps: FlowUndo): void {
  const latest = useRef(steps)
  useEffect(() => {
    latest.current = steps
  })
  useEffect(() => {
    const entry = latest
    flows.push(entry)
    contextMayHaveChanged()
    return () => {
      const at = flows.indexOf(entry)
      if (at !== -1) flows.splice(at, 1)
      contextMayHaveChanged()
    }
  }, [])
}

// -- The app's history, in main --------------------------------------------------------------

/** Screens that reload when the app's history ran an undo or redo. */
const ranListeners = new Set<() => void>()

/** Reload what this shows after an app undo or redo (Edit › Undo, ⌘Z, a toast's Undo). */
export function useUndoRan(listener: () => void): void {
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => {
    const call = () => latest.current()
    ranListeners.add(call)
    return () => {
      ranListeners.delete(call)
    }
  }, [])
}

/** Whoever carries out an entry only the window can act on: Details, for Discard your changes. */
let rendererUndo: ((op: RendererUndoOp) => void) | null = null

/** Takes the entries only the window can carry out. Returns the remover. */
export function setRendererUndo(carry: (op: RendererUndoOp) => void): () => void {
  rendererUndo = carry
  return () => {
    if (rendererUndo === carry) rendererUndo = null
  }
}

/**
 * What an undo or redo from the app's history did, carried out in the window: an entry only the
 * window acts on goes to its owner, the screens reload, and a step that couldn't run says why.
 */
export function afterUndo(result: UndoRunResult, direction: UndoDirection): void {
  if (result.status === 'done') {
    if (result.renderer) rendererUndo?.(result.renderer)
    ranListeners.forEach((listener) => listener())
  } else if (result.status === 'dropped') {
    toast({
      variant: 'error',
      message: `Couldn’t ${direction} ${result.label}: ${result.reason}`
    })
    ranListeners.forEach((listener) => listener())
  }
}

/** Why a toast's Undo is disabled: a newer action touched the same things. The Toast owns the copy. */
export { CHANGED_SINCE }

/**
 * Undoes one action's own entry (a toast's Undo, the library's "Undo …"): main undoes it, out of
 * order when nothing newer touched the same things, and the screens reload.
 */
export async function undoEntry(entryId: number): Promise<void> {
  const res = await window.api.invoke(IPC_CHANNELS.UNDO_ENTRY, { id: entryId }).catch(() => null)
  if (!res?.success) {
    toast({ variant: 'error', message: 'Couldn’t undo that', description: 'Try ⌘Z.' })
    return
  }
  if (res.data.status === 'blocked') toast({ variant: 'error', message: CHANGED_SINCE })
  else afterUndo(res.data, 'undo')
}

/** The routes through main: undo:run and redo:run, and undo:field for a field. */
export const ipcUndoRoutes: UndoRoutes = {
  app: async (direction) => {
    const channel = direction === 'undo' ? IPC_CHANNELS.UNDO_RUN : IPC_CHANNELS.REDO_RUN
    const res = await window.api.invoke(channel, undefined).catch(() => null)
    if (res?.success) afterUndo(res.data, direction)
  },
  fieldFallback: async (direction) => {
    await window.api.invoke(IPC_CHANNELS.UNDO_FIELD, { direction }).catch(() => {})
  }
}

/**
 * Tells main where ⌘Z lands whenever that changes (undo:context), so the Edit menu says plain
 * "Undo" in a field or a flow and names the action elsewhere. Mount once, with the menu commands.
 */
export function useUndoContextReport(): void {
  useEffect(() => {
    let last: UndoContext | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const report = () => {
      const now = undoContext()
      if (now === last) return
      last = now
      void window.api.invoke(IPC_CHANNELS.UNDO_CONTEXT, { context: now }).catch(() => {})
    }
    // Focus has settled by the next task: on focusout the active element is still the old one.
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(report, 0)
    }
    report()
    contextListeners.add(later)
    document.addEventListener('focusin', later)
    document.addEventListener('focusout', later)
    return () => {
      clearTimeout(timer)
      contextListeners.delete(later)
      document.removeEventListener('focusin', later)
      document.removeEventListener('focusout', later)
    }
  }, [])
}

/** What the app's next undo and redo are, by name ("Move to Trash"), from the undo:state push. */
export function useUndoLabels(): { undoLabel?: string; redoLabel?: string } {
  const [labels, setLabels] = useState<{ undoLabel?: string; redoLabel?: string }>({})
  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.UNDO_STATE, (state) =>
        setLabels({
          ...(state.undoLabel !== undefined ? { undoLabel: state.undoLabel } : {}),
          ...(state.redoLabel !== undefined ? { redoLabel: state.redoLabel } : {})
        })
      ),
    []
  )
  return labels
}
