import { describe, expect, it } from 'vitest'
import type { LookOverCarry } from '@shared/approval'
import { cardNote, headsUp, offerLine, offerPreview, railCarryNote } from './edit-offer'

// The edit check and the offer on a variant (design/specs/look-over.md, L7).

const terracotta = { tagId: 5, label: 'Terracotta', categoryId: 3, categoryLabel: 'Colour' }
const studio = { tagId: 6, label: 'Studio', categoryId: 4, categoryLabel: 'Scene' }
const OWN = 'Clay-style iPhone 15 Pro mockup on a warm beige backdrop, seen from the side.'
const REWRITE = 'Clay-style iPhone 15 Pro mockup on a terracotta backdrop, seen from the side.'

const carry = (over: Partial<LookOverCarry> = {}): LookOverCarry => ({
  state: 'offered',
  reason: null,
  why: 'unjudged',
  after: { description: REWRITE, via: 'rewrite' },
  tagsAdded: [terracotta],
  tagsRemoved: [studio],
  ...over
})

const line = (c: LookOverCarry | null, acceptedHere = false) =>
  offerLine(c, { reached: 3, acceptedHere })

describe('offerLine: the status line for an edit to the top', () => {
  it('L7.2: says the check is running', () => {
    expect(line(carry({ state: 'checking', why: null, after: null }))).toEqual({
      kind: 'working',
      message: 'Checking how your edits to the top mockup fit the 3 variants…'
    })
    expect(
      offerLine(carry({ state: 'checking', why: null }), { reached: 1, acceptedHere: false })
        ?.message
    ).toBe('Checking how your edits to the top mockup fit the variant…')
  })

  it('L7.3, L7.4, L7.8: says how the edit got in, with Undo', () => {
    expect(line(carry({ state: 'applied', why: null }))).toEqual({
      kind: 'done',
      message: 'Worked your top mockup edits into this one’s own words.',
      action: 'undo'
    })
    expect(line(carry({ state: 'reworded', why: null }))).toEqual({
      kind: 'done',
      message: 'Your edits were reworded for this one.',
      action: 'undo'
    })
    expect(line(carry({ state: 'applied', why: null }), true)?.message).toBe(
      'Applied your top mockup edits to this one.'
    )
  })

  it.each([
    ['unjudged', 'off', 'Use your top mockup edits here too?', 'apply-here'],
    ['refused', 'off', 'Left out your top mockup edits.', 'apply-anyway'],
    ['slow', 'off', 'The check is slow, so your top mockup edits are offered here.', 'apply-here'],
    [
      'failed',
      'failed',
      'Couldn’t check your edits, so they’re offered here instead.',
      'apply-here'
    ],
    [
      'undone',
      'off',
      'Back to this one’s own words. Your top mockup edits stay on offer.',
      'apply-here'
    ]
  ] as const)(
    'an offer made because %s reads as its screen does, dismissable',
    (why, kind, message, action) => {
      expect(line(carry({ why }))).toEqual({ kind, message, action, dismissible: true })
    }
  )

  it('L7.10: a dismissed offer has nothing to say, and nothing reached says nothing', () => {
    expect(line(carry({ state: 'dismissed' }))).toBeNull()
    expect(line(null)).toBeNull()
  })
})

describe('headsUp: L7.1 on the top, once its description or tags changed', () => {
  it('says what Next will do, by whether the model checks edits', () => {
    expect(headsUp({ edited: true, untouched: 3, checksEdits: true })).toEqual({
      kind: 'done',
      message: 'When you go on, your edits get checked against the 3 variants.'
    })
    expect(headsUp({ edited: true, untouched: 3, checksEdits: false })?.message).toBe(
      'When you go on, your edits are offered on the 3 variants.'
    )
    expect(headsUp({ edited: true, untouched: 1, checksEdits: false })?.message).toBe(
      'When you go on, your edits are offered on the variant.'
    )
  })

  it('says nothing before an edit, or with no untouched variant to reach', () => {
    expect(headsUp({ edited: false, untouched: 3, checksEdits: true })).toBeNull()
    expect(headsUp({ edited: true, untouched: 0, checksEdits: true })).toBeNull()
  })
})

describe('notes on the rail and the review cards', () => {
  it('the rail: checking, applied, reworded, offered; a dismissed offer leaves no note', () => {
    expect(railCarryNote(carry({ state: 'checking' }))).toBe('Checking your edits…')
    expect(railCarryNote(carry({ state: 'applied' }))).toBe('Edits applied')
    expect(railCarryNote(carry({ state: 'reworded' }))).toBe('Edits reworded')
    expect(railCarryNote(carry())).toBe('Edits offered')
    expect(railCarryNote(carry({ state: 'dismissed' }))).toBeNull()
    expect(railCarryNote(null)).toBeNull()
  })

  it('the review cards (L7.6, L7.11): the result, or how to answer an offer', () => {
    expect(cardNote(carry({ state: 'applied' }))).toBe('Edits applied')
    expect(cardNote(carry({ state: 'reworded' }))).toBe('Edits reworded for this one')
    expect(cardNote(carry())).toBe('Edits offered: open it to apply')
    expect(cardNote(carry({ state: 'dismissed' }))).toBeNull()
  })
})

describe('offerPreview: what the preview shows (L7.7, L7.9, L7.12)', () => {
  it('L7.9: nothing checked, the rewrite as a word diff, and only the tag changes', () => {
    const p = offerPreview(carry(), OWN, false)
    expect(p.description).toBe('Not checked for this variant, so look before you apply.')
    expect(p.applyLabel).toBe('Apply here')
    expect(p.body).toMatchObject({ kind: 'diff', copied: false, diff: { mode: 'inline' } })
    expect(p.adds).toEqual([terracotta])
    expect(p.removes).toEqual([studio])
  })

  it('L7.7: the model’s reason in the header, as a sentence, with Apply anyway', () => {
    const p = offerPreview(
      carry({ why: 'refused', reason: 'this one is on a white backdrop' }),
      OWN,
      true
    )
    expect(p.description).toBe('This one is on a white backdrop.')
    expect(p.applyLabel).toBe('Apply anyway')
  })

  it('L7.12: preparing while the version isn’t ready, the tag changes already known', () => {
    const p = offerPreview(carry({ after: null }), OWN, true)
    expect(p.body).toEqual({ kind: 'preparing' })
    expect(p.adds).toEqual([terracotta])
  })

  it('marks the top’s words when the rewrite failed, and leaves out a description that doesn’t change', () => {
    expect(
      offerPreview(carry({ after: { description: 'Top words.', via: 'copy' } }), OWN, true).body
    ).toMatchObject({
      kind: 'diff',
      copied: true
    })
    expect(
      offerPreview(carry({ after: { description: OWN, via: 'rewrite' } }), OWN, true).body
    ).toEqual({
      kind: 'diff',
      diff: null,
      copied: false
    })
  })

  it('an undone offer says nothing was checked only when the model doesn’t check edits', () => {
    expect(offerPreview(carry({ why: 'undone' }), OWN, false).description).toBe(
      'Not checked for this variant, so look before you apply.'
    )
    expect(offerPreview(carry({ why: 'undone' }), OWN, true).description).toBeNull()
  })
})
