import type { UndoContext } from '@shared/ipc/undo'

/** Edit › Undo and Redo as they read now. */
export interface UndoMenuItems {
  undo: { label: string; enabled: boolean }
  redo: { label: string; enabled: boolean }
}

/** Before the history says otherwise: plain, and on, so a field's own undo always works. */
export const PLAIN_UNDO: UndoMenuItems = {
  undo: { label: 'Undo', enabled: true },
  redo: { label: 'Redo', enabled: true }
}

/** The next undo or redo in the app's history. A toast's out-of-order undo is a `reversal`. */
interface UndoMenuStep {
  label: string
  reversal: boolean
}

/**
 * Edit › Undo and Redo, named from the app's history ("Undo Move to Trash") and off when it has
 * nothing. In a field or an open flow they read plain "Undo" and "Redo", since ⌘Z goes to that
 * field's or flow's own steps. The step a toast's out-of-order undo recorded reads plain "Undo":
 * ⌘Z puts that action back, which its name would tell the other way round.
 */
export function undoMenuItems(
  context: UndoContext,
  next: { undo: UndoMenuStep | null; redo: UndoMenuStep | null }
): UndoMenuItems {
  if (context !== 'app') return PLAIN_UNDO
  const name = (verb: string, step: UndoMenuStep | null) =>
    step && !step.reversal ? `${verb} ${step.label}` : verb
  return {
    undo: { label: name('Undo', next.undo), enabled: next.undo !== null },
    redo: { label: name('Redo', next.redo), enabled: next.redo !== null }
  }
}
