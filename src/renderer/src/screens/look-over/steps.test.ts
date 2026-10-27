import { describe, expect, it } from 'vitest'
import {
  NO_STEPS,
  record,
  redoAnswer,
  stepBack,
  stepForward,
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
