import type { AnswerEditRequest } from '@shared/approval'

/**
 * Look it over's own steps (design/specs/undo.md, settled point 3): what ⌘Z takes back while the
 * flow is open and focus is outside a field, and ⇧⌘Z puts forward again. An answer to the top's
 * edit on a variant (apply it, its Undo, dismiss it, bring it back) is one, and so is a stash,
 * which is also an entry in the app's history: one action, in both.
 */
export type LookOverStep =
  | { kind: 'answer'; mockupId: number; action: AnswerEditRequest['action'] }
  | { kind: 'stash'; unitId: number; entryId: number; count: number }

export interface StepList {
  /** Taken in this session, newest last. */
  done: readonly LookOverStep[]
  /** Taken back since the last new step, newest last: what ⇧⌘Z puts forward. */
  undone: readonly LookOverStep[]
}

export const NO_STEPS: StepList = { done: [], undone: [] }

/** A new step. It clears what was waiting to go forward, as in every Mac app. */
export const record = (list: StepList, step: LookOverStep): StepList => ({
  done: [...list.done, step],
  undone: []
})

/** The newest step to take back, and the list once it is. Null when there's none. */
export function stepBack(list: StepList): { step: LookOverStep; list: StepList } | null {
  const step = list.done.at(-1)
  if (!step) return null
  return { step, list: { done: list.done.slice(0, -1), undone: [...list.undone, step] } }
}

/** The step taken back last, to put forward again, and the list once it is. */
export function stepForward(list: StepList): { step: LookOverStep; list: StepList } | null {
  const step = list.undone.at(-1)
  if (!step) return null
  return { step, list: { done: [...list.done, step], undone: list.undone.slice(0, -1) } }
}

const REVERSE: Record<AnswerEditRequest['action'], AnswerEditRequest['action']> = {
  accept: 'undo',
  undo: 'accept',
  dismiss: 'restore',
  restore: 'dismiss'
}

/** The answer that takes this one back: applying is undone, dismissing is restored. */
export const undoAnswer = (action: AnswerEditRequest['action']) => REVERSE[action]

/** The answer that puts it forward again: the same one. */
export const redoAnswer = (action: AnswerEditRequest['action']) => action

/**
 * Lines the stashes up with the app's history (the undo:state push's entries, by id). A stash
 * whose entry has left the history was undone, from the flow, its toast or the Edit menu, so its
 * step goes back; one whose entry is back was redone, so it comes forward. Says which moved.
 */
export function syncStashes(
  list: StepList,
  entryIds: readonly number[]
): { list: StepList; unstashed: LookOverStep[]; restashed: LookOverStep[] } {
  const live = new Set(entryIds)
  const inHistory = (step: LookOverStep) => step.kind !== 'stash' || live.has(step.entryId)
  const unstashed = list.done.filter((step) => !inHistory(step))
  const restashed = list.undone.filter((step) => step.kind === 'stash' && inHistory(step))
  if (unstashed.length === 0 && restashed.length === 0) return { list, unstashed, restashed }
  return {
    list: {
      done: [...list.done.filter(inHistory), ...restashed],
      undone: [...list.undone.filter((step) => !restashed.includes(step)), ...unstashed]
    },
    unstashed,
    restashed
  }
}
