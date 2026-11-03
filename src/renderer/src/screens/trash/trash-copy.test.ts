import { describe, expect, it } from 'vitest'
import { restoredTo, trashCaption } from './trash-copy'

// Trash marks where each card came from, and Restore puts it back there (design/specs/undo.md,
// "Toss goes to Trash").

describe('trashCaption', () => {
  it('names the inbox a tossed card came from', () => {
    expect(trashCaption('to-sort', '2 min ago')).toBe('Tossed from To sort · 2 min ago')
    expect(trashCaption('to-stash', 'just now')).toBe('Tossed from To stash · just now')
  })

  it('reads as before for one moved to Trash from My Stash', () => {
    expect(trashCaption('my-stash', '2 days ago')).toBe('Trashed 2 days ago')
  })

  it('says when an undone import put it there', () => {
    expect(trashCaption('import', '1 hour ago')).toBe('From an undone import · 1 hour ago')
  })
})

describe('restoredTo', () => {
  it('names where everything restored went back to', () => {
    expect(restoredTo(['my-stash', 'my-stash'])).toBe('Restored to My Stash')
    expect(restoredTo(['to-sort'])).toBe('Restored to To sort')
    expect(restoredTo(['to-stash'])).toBe('Restored to To stash')
    expect(restoredTo(['import'])).toBe('Restored to To sort')
  })

  it('is plain when they went back to different places', () => {
    expect(restoredTo(['my-stash', 'to-sort'])).toBe('Restored')
    expect(restoredTo([])).toBe('Restored')
  })
})
