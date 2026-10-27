import type { DiscardedEdit } from '@shared/ipc/undo'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useDetailsStore } from '@renderer/stores/detailsStore'

/**
 * Discard your changes, made undoable (design/specs/undo.md): the edits the sidebar holds, so a
 * discard can keep them, and the way Undo puts them back and Redo drops them again.
 */

/** The unsaved edits on screen, and whose they are. Null when nothing is unsaved. */
let open: { mockupId: number; values: DiscardedEdit } | null = null

/** The sidebar's form says what it holds unsaved, or null once nothing is. */
export function noteEdit(mockupId: number, values: DiscardedEdit | null): void {
  if (values) open = { mockupId, values }
  else if (open?.mockupId === mockupId) open = null
}

/** The unsaved edits a discard is about to throw away. */
export const currentEdit = () => open

/** Edits Undo brought back, waiting for the sidebar to load their mockup. */
const waiting = new Map<number, DiscardedEdit>()
type Listener = (mockupId: number) => void
const restored = new Set<Listener>()
const discarded = new Set<Listener>()

/**
 * Undo of a discard: the sidebar shows that mockup as fields again, holding the discarded edits.
 * A sidebar already on it takes them at once; otherwise the page selects it and the sidebar takes
 * them as it loads.
 */
export function restoreEdit(mockupId: number, values: DiscardedEdit): void {
  waiting.set(mockupId, values)
  const details = useDetailsStore.getState()
  details.requestEdit(mockupId)
  if (details.target?.id !== mockupId) {
    useDetailEffects.getState().selectAfterReload([mockupId])
    useDetailEffects.getState().notifyChanged()
  }
  restored.forEach((listener) => listener(mockupId))
}

/** The edits waiting for this mockup's sidebar, taken once. */
export function takeRestored(mockupId: number): DiscardedEdit | undefined {
  const values = waiting.get(mockupId)
  waiting.delete(mockupId)
  return values
}

/** Redo of a discard: the edits go again, and the fields close. */
export function discardEdit(mockupId: number): void {
  waiting.delete(mockupId)
  discarded.forEach((listener) => listener(mockupId))
}

/** The sidebar's form hears both, for its own mockup. Returns the remover. */
export function onEditUndo(onRestored: Listener, onDiscarded: Listener): () => void {
  restored.add(onRestored)
  discarded.add(onDiscarded)
  return () => {
    restored.delete(onRestored)
    discarded.delete(onDiscarded)
  }
}
