import { describe, expect, it } from 'vitest'
import { wordDiff } from './word-diff'

// The preview's description diff (design/specs/look-over.md, L7.7 and L7.9).

describe('wordDiff', () => {
  it('marks only the words that change, removed before added, in one sentence', () => {
    expect(
      wordDiff(
        'Clay-style iPhone 15 Pro mockup on a warm beige backdrop, seen from the side.',
        'Clay-style iPhone 15 Pro mockup on a terracotta backdrop, seen from the side.'
      )
    ).toEqual({
      mode: 'inline',
      parts: [
        { kind: 'same', text: 'Clay-style iPhone 15 Pro mockup on a' },
        { kind: 'removed', text: 'warm beige' },
        { kind: 'added', text: 'terracotta' },
        { kind: 'same', text: 'backdrop, seen from the side.' }
      ]
    })
  })

  it('handles words added or taken out with nothing in their place', () => {
    // Punctuation stays with its word, so "stand." gives way to "stand by the sea.".
    expect(
      wordDiff('A clay phone on a wooden stand.', 'A clay phone on a wooden stand by the sea.')
    ).toMatchObject({
      mode: 'inline',
      parts: [
        { kind: 'same', text: 'A clay phone on a wooden' },
        { kind: 'removed', text: 'stand.' },
        { kind: 'added', text: 'stand by the sea.' }
      ]
    })
    expect(wordDiff('A clay phone on sand.', 'A phone on sand.')).toMatchObject({
      mode: 'inline',
      parts: [
        { kind: 'same', text: 'A' },
        { kind: 'removed', text: 'clay' },
        { kind: 'same', text: 'phone on sand.' }
      ]
    })
  })

  it('falls back to before and after on two rows when most of the sentence changes', () => {
    expect(
      wordDiff('A clay phone on a beige stand.', 'Terracotta tote bag hanging from a hook.')
    ).toEqual({
      mode: 'rows',
      before: 'A clay phone on a beige stand.',
      after: 'Terracotta tote bag hanging from a hook.'
    })
  })

  it('is all the same when nothing changed, and all added from nothing', () => {
    expect(wordDiff('A clay phone.', 'A clay phone.')).toEqual({
      mode: 'inline',
      parts: [{ kind: 'same', text: 'A clay phone.' }]
    })
    expect(wordDiff('', 'A clay phone.')).toEqual({
      mode: 'rows',
      before: '',
      after: 'A clay phone.'
    })
  })
})
