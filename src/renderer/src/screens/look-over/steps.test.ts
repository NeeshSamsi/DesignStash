import { describe, expect, it } from 'vitest'
import {
  NO_STEPS,
  record,
  redoAnswer,
  stepBack,
  stepForward,
  syncStashes,
  undoAnswer,
  type LookOverStep
} from './steps'

// Look it over's own steps (design/specs/undo.md, settled point 3): ⌘Z inside the flow takes back
// its last step, and ⇧⌘Z puts it forward again.

const accept: LookOverStep = { kind: 'answer', mockupId: 11, action: 'accept' }
const dismiss: LookOverStep = { kind: 'answer', mockupId: 12, action: 'dismiss' }

describe('the step list', () => {
  it('takes steps back newest first, and forward in the order they were taken back', () => {
    const list = record(record(NO_STEPS, accept), dismiss)
    const back = stepBack(list)!
    expect(back.step).toEqual(dismiss)
    const again = stepBack(back.list)!
    expect(again.step).toEqual(accept)
    expect(stepBack(again.list)).toBeNull()
    const forward = stepForward(again.list)!
    expect(forward.step).toEqual(accept)
    expect(stepForward(forward.list)!.step).toEqual(dismiss)
  })

  it('a new step clears what was waiting to go forward', () => {
    const undone = stepBack(record(NO_STEPS, accept))!.list
    expect(stepForward(record(undone, dismiss))).toBeNull()
  })
})

describe('what taking an answer back does', () => {
  it('pairs each answer with the one that reverses it', () => {
    expect(undoAnswer('accept')).toBe('undo')
    expect(undoAnswer('dismiss')).toBe('restore')
    expect(undoAnswer('undo')).toBe('accept')
    expect(undoAnswer('restore')).toBe('dismiss')
  })

  it('puts it forward again as it was given', () => {
    expect(redoAnswer('accept')).toBe('accept')
    expect(redoAnswer('dismiss')).toBe('dismiss')
  })
})

describe('a stash is one action with its entry in the app’s history', () => {
  const stash = (unitId: number, entryId: number): LookOverStep => ({
    kind: 'stash',
    unitId,
    entryId,
    count: 2
  })

  it('goes back once its entry has left the history, however it was undone', () => {
    const list = record(record(NO_STEPS, accept), stash(10, 5))
    const synced = syncStashes(list, [])
    expect(synced.list.done).toEqual([accept])
    expect(synced.list.undone).toEqual([stash(10, 5)])
    expect(synced.unstashed).toEqual([stash(10, 5)])
    expect(synced.restashed).toEqual([])
  })

  it('comes forward again once its entry is back (redone)', () => {
    const undone = stepBack(record(NO_STEPS, stash(10, 5)))!.list
    const synced = syncStashes(undone, [5])
    expect(synced.list.done).toEqual([stash(10, 5)])
    expect(synced.restashed).toEqual([stash(10, 5)])
  })

  it('changes nothing while the history agrees', () => {
    const list = record(NO_STEPS, stash(10, 5))
    const synced = syncStashes(list, [3, 5])
    expect(synced.list).toBe(list)
    expect(synced.unstashed).toEqual([])
    expect(synced.restashed).toEqual([])
  })
})
