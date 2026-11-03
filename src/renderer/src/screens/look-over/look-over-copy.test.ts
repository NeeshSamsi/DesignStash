import { describe, expect, it } from 'vitest'
import { doneMessage, stashRefusal } from './look-over-copy'

describe('doneMessage', () => {
  it('says all tucked away when nothing is waiting', () => {
    expect(doneMessage(12, 0)).toBe('All tucked away · 12 mockups stashed')
    expect(doneMessage(1, 0)).toBe('All tucked away · 1 mockup stashed')
  })
  it('says how many skipped ones are waiting in To stash', () => {
    expect(doneMessage(9, 3)).toBe('9 tucked away · 3 skipped ones are waiting in To stash.')
    expect(doneMessage(9, 1)).toBe('9 tucked away · 1 skipped one is waiting in To stash.')
  })
})

describe('stashRefusal', () => {
  it('has plain words for each reason', () => {
    for (const reason of ['not-ready', 'no-cover'] as const) {
      const { title, description } = stashRefusal(reason)
      expect(`${title} ${description}`).not.toMatch(/not-ready|no-cover|[/\\]/)
    }
  })
})
