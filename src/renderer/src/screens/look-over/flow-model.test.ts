import { describe, expect, it } from 'vitest'
import type { LookOverItem, LookOverQueue, LookOverUnit } from '@shared/approval'
import {
  NOT_CHECKED,
  afterStash,
  back,
  backTarget,
  canSkip,
  createFlow,
  currentItem,
  deck,
  finished,
  headerBadge,
  jumpTo,
  landedDraft,
  next,
  onReview,
  primary,
  progress,
  rail,
  reviewCards,
  skip,
  type FlowState
} from './flow-model'

const item = (
  mockupId: number,
  role: LookOverItem['role'],
  over: Partial<LookOverItem> = {}
): LookOverItem => ({
  mockupId,
  pileId: role === 'single' ? null : 1,
  role,
  title: `m${mockupId}`,
  description: '',
  tags: [],
  touched: false,
  checked: false,
  waitingForAi: false,
  carry: null,
  cover: { path: '/c.png', source: 'embedded', missing: false, width: 1, height: 1 },
  ...over
})

const pile = (unitId: number, ids: number[], over: Partial<LookOverItem> = {}): LookOverUnit => ({
  unitId,
  kind: 'pile',
  items: ids.map((id, i) => item(id, i === 0 ? 'top' : 'variant', over))
})
const single = (id: number): LookOverUnit => ({
  unitId: id,
  kind: 'single',
  items: [item(id, 'single')]
})

/** Two piles (3 and 2 mockups), then two on their own: 7 mockups. */
const queue = (over: Partial<LookOverQueue> = {}): LookOverQueue => ({
  units: [pile(1, [10, 11, 12]), pile(2, [20, 21]), single(30), single(31)],
  resume: null,
  ...over
})
const start = () => createFlow(queue())
const at = (s: FlowState) => `${s.position.unit}:${s.position.step}`

describe('createFlow', () => {
  it('starts on the first pile’s top mockup', () => {
    const s = start()
    expect(at(s)).toBe('0:0')
    expect(currentItem(s)?.mockupId).toBe(10)
  })

  it('resumes where Finish later left off, and keeps what was already checked', () => {
    const q = queue({ resume: { unitId: 2, mockupId: 21 } })
    q.units = [pile(1, [10, 11, 12], { checked: true }), ...q.units.slice(1)]
    const s = createFlow(q)
    expect(at(s)).toBe('1:1')
    expect(s.checked.has(11)).toBe(true)
  })

  it('ignores a resume point that is no longer in the queue', () => {
    expect(at(createFlow(queue({ resume: { unitId: 99, mockupId: 1 } })))).toBe('0:0')
  })
})

describe('Next and jumping', () => {
  it('goes top, variants, then Review, and no further', () => {
    let s = start()
    s = next(s)
    expect(at(s)).toBe('0:1')
    s = next(next(s))
    expect(at(s)).toBe('0:3')
    expect(onReview(s)).toBe(true)
    expect(next(s)).toBe(s)
  })

  it('marks each mockup looked at as it is opened and left', () => {
    let s = start()
    expect(s.checked.has(10)).toBe(false)
    s = next(s)
    expect(s.checked.has(10)).toBe(true)
    expect(s.checked.has(11)).toBe(true)
    expect(s.checked.has(12)).toBe(false)
  })

  it('lets any step in the rail be opened, back or forward', () => {
    let s = jumpTo(start(), 2)
    expect(at(s)).toBe('0:2')
    s = jumpTo(s, 0)
    expect(at(s)).toBe('0:0')
  })

  it('marks mockups jumped past without opening as skipped, and un-skips them when opened', () => {
    let s = jumpTo(start(), 3)
    expect([...s.skipped].sort()).toEqual([11, 12])
    expect(onReview(s)).toBe(true)
    s = jumpTo(s, 1)
    expect([...s.skipped]).toEqual([12])
    expect(s.checked.has(11)).toBe(true)
  })

  it('does not skip a mockup that was already looked at', () => {
    let s = next(start()) // opens 11
    s = jumpTo(s, 0)
    s = jumpTo(s, 3)
    expect([...s.skipped]).toEqual([12])
  })

  it('ignores a jump to the same step or out of range', () => {
    const s = start()
    expect(jumpTo(s, 0)).toBe(s)
    expect(jumpTo(s, 9)).toBe(s)
    expect(jumpTo(s, -1)).toBe(s)
  })
})

describe('Review & stash', () => {
  it('shows the pile’s drafts as cards, with skipped ones noted as not checked', () => {
    const s = jumpTo(start(), 3)
    expect(reviewCards(s)).toEqual([
      { mockupId: 10, note: null },
      { mockupId: 11, note: NOT_CHECKED },
      { mockupId: 12, note: NOT_CHECKED }
    ])
    expect(NOT_CHECKED).toBe('Not checked · pre-filled from the top mockup')
  })

  it('commits with Stash pile (N) counting every mockup in the pile', () => {
    const s = jumpTo(start(), 3)
    expect(primary(s)).toEqual({ kind: 'stash-pile', label: 'Stash pile (3)' })
  })

  it('starts the next pile on its top mockup after a stash, with everything in the pile looked at', () => {
    const s = afterStash(jumpTo(start(), 3))
    expect(at(s)).toBe('1:0')
    expect(s.stashed.has(1)).toBe(true)
    expect([10, 11, 12].every((id) => s.checked.has(id))).toBe(true)
    expect(headerBadge(s)).toBe('Pile 2 of 2')
  })

  it('finishes once every unit is stashed', () => {
    let s = start()
    expect(finished(s)).toBe(false)
    for (let i = 0; i < 4; i += 1) {
      s = afterStash(s)
    }
    expect(finished(s)).toBe(true)
  })
})

describe('Back', () => {
  it('goes to the previous draft inside a pile, the same as the step above in the rail', () => {
    let s = jumpTo(start(), 2)
    expect(backTarget(s)).toEqual({
      kind: 'position',
      position: { unit: 0, step: 1 },
      stashed: false
    })
    s = back(s)
    expect(at(s)).toBe('0:1')
  })

  it('goes from the review step to the last draft', () => {
    const s = jumpTo(start(), 3)
    expect(backTarget(s)).toMatchObject({ position: { unit: 0, step: 2 } })
  })

  it('goes from a pile’s top mockup to the previous pile’s review, marked stashed and editable', () => {
    const s = afterStash(jumpTo(start(), 3)) // now on pile 2, top
    expect(backTarget(s)).toEqual({
      kind: 'position',
      position: { unit: 0, step: 3 },
      stashed: true
    })
    const reopened = back(s)
    expect(at(reopened)).toBe('0:3')
    expect(headerBadge(reopened)).toBe('Pile 1 of 2 · stashed')
  })

  it('goes from the first mockup on its own to the last pile’s review', () => {
    let s = createFlow(queue({ resume: { unitId: 30, mockupId: 30 } }))
    s = { ...s, stashed: new Set([1, 2]) }
    expect(backTarget(s)).toEqual({
      kind: 'position',
      position: { unit: 1, step: 2 },
      stashed: true
    })
  })

  it('goes from one on its own to the previous one, and its primary is Save & next once stashed', () => {
    let s = createFlow(queue({ resume: { unitId: 31, mockupId: 31 } }))
    s = { ...s, stashed: new Set([1, 2, 30]) }
    expect(backTarget(s)).toEqual({
      kind: 'position',
      position: { unit: 2, step: 0 },
      stashed: true
    })
    const reopened = back(s)
    expect(primary(reopened)).toEqual({ kind: 'save-next', label: 'Save & next' })
  })

  it('labels the review of a pile that is already stashed Save & next, or Save on the last unit', () => {
    const s = afterStash(jumpTo(start(), 3))
    const reopened = back(s)
    expect(onReview(reopened)).toBe(true)
    expect(primary(reopened)).toEqual({ kind: 'stash-pile', label: 'Save & next' })
    const only = createFlow({ units: [pile(1, [10, 11])], resume: null })
    const lastReview = jumpTo(only, 2)
    expect(primary(lastReview).label).toBe('Stash pile (2)')
    expect(primary({ ...lastReview, stashed: new Set([1]) })).toEqual({
      kind: 'stash-pile',
      label: 'Save'
    })
  })

  it('goes from the very first mockup to Sort only while nothing is stashed', () => {
    const s = start()
    expect(backTarget(s)).toEqual({ kind: 'sort' })
    expect(back(s)).toBe(s)
    const stashedSomething = { ...s, stashed: new Set([2]) }
    expect(backTarget(stashedSomething)).toBeNull()
  })

  it('goes back to Sort from a first mockup on its own when there are no piles', () => {
    const s = createFlow({ units: [single(1), single(2)], resume: null })
    expect(backTarget(s)).toEqual({ kind: 'sort' })
  })
})

describe('Header badge', () => {
  it('reads Pile n of m in a pile and adds review on the review step', () => {
    let s = start()
    expect(headerBadge(s)).toBe('Pile 1 of 2')
    s = jumpTo(s, 3)
    expect(headerBadge(s)).toBe('Pile 1 of 2 · review')
  })

  it('uses the plain haul count after the last pile', () => {
    let s = createFlow(queue({ resume: { unitId: 30, mockupId: 30 } }))
    expect(headerBadge(s)).toBe('6 of 7')
    s = afterStash(s)
    expect(headerBadge(s)).toBe('7 of 7')
  })

  it('uses the haul count from the start when nothing is in a pile', () => {
    expect(
      headerBadge(createFlow({ units: [single(1), single(2), single(3)], resume: null }))
    ).toBe('1 of 3')
  })
})

describe('Deck', () => {
  it('counts the mockups not looked at yet, and thins as you go', () => {
    let s = start()
    expect(deck(s)).toEqual({
      remaining: 2,
      showDeck: true,
      deckMore: true,
      label: '2 left in this pile'
    })
    s = next(s)
    expect(deck(s)).toEqual({
      remaining: 1,
      showDeck: true,
      deckMore: false,
      label: '1 left in this pile'
    })
  })

  it('has no deck on the last mockup, on review, or on a mockup on its own', () => {
    let s = jumpTo(start(), 2)
    expect(deck(s).showDeck).toBe(false)
    s = jumpTo(s, 3)
    expect(deck(s)).toMatchObject({ remaining: 0, showDeck: false })
    expect(deck(createFlow({ units: [single(1)], resume: null })).showDeck).toBe(false)
  })

  it('peeks one card for a pile of two', () => {
    const s = createFlow({ units: [pile(1, [10, 11])], resume: null })
    expect(deck(s)).toMatchObject({ remaining: 1, showDeck: true, deckMore: false })
  })

  it('does not count mockups already looked at', () => {
    const s = createFlow({ units: [pile(1, [10, 11, 12])], resume: null })
    const looked = { ...s, checked: new Set([11]) }
    expect(deck(looked).remaining).toBe(1)
  })
})

describe('Rail', () => {
  it('lists the top mockup, variants, then Review & stash pile, with statuses', () => {
    const s = jumpTo(next(start()), 1)
    const r = rail(s)!
    expect(r.pile).toBe('PILE 1 OF 2')
    expect(r.title).toBe('m10')
    expect(r.steps.map((x) => [x.label, x.status])).toEqual([
      ['Top · m10', 'done'],
      ['Variant · m11 · 1', 'current'],
      ['Variant · m12 · 2', 'todo'],
      ['Review & stash pile', 'todo']
    ])
    expect(r.steps.map((x) => x.showConnector)).toEqual([true, true, true, false])
  })

  it('follows the edited titles, and keeps the opened title when a draft title is blank', () => {
    const r = rail(start(), { 10: 'Edited top', 11: 'Edited variant', 12: '   ' })!
    expect(r.title).toBe('Edited top')
    expect(r.steps.map((x) => x.label)).toEqual([
      'Top · Edited top',
      'Variant · Edited variant · 1',
      'Variant · m12 · 2',
      'Review & stash pile'
    ])
  })

  it('marks mockups jumped past as skipped, and Review as current on review', () => {
    const r = rail(jumpTo(start(), 3))!
    expect(r.steps.map((x) => x.status)).toEqual(['done', 'skipped', 'skipped', 'current'])
  })

  it('has no rail for a mockup on its own', () => {
    expect(rail(createFlow({ units: [single(1)], resume: null }))).toBeNull()
  })

  it('gives every step the index to jump to', () => {
    expect(rail(start())!.steps.map((x) => x.step)).toEqual([0, 1, 2, 3])
  })
})

describe('Primary button', () => {
  it('is Next in a pile, then Stash pile (N)', () => {
    expect(primary(start())).toEqual({ kind: 'next', label: 'Next' })
  })

  it('is Stash & next on a single, and Stash on the last', () => {
    const s = createFlow({ units: [single(1), single(2)], resume: null })
    expect(primary(s)).toEqual({ kind: 'stash', label: 'Stash & next' })
    const last = afterStash(s)
    expect(primary(last)).toEqual({ kind: 'stash', label: 'Stash' })
  })
})

describe('Skip', () => {
  const singles = () => createFlow({ units: [single(1), single(2), single(3)], resume: null })

  it('is only for mockups on their own', () => {
    expect(canSkip(start())).toBe(false)
    expect(skip(start())).toEqual(start())
  })

  it('sends one to the end of the queue and shows the next', () => {
    const s = skip(singles())
    expect(s.units.map((u) => u.unitId)).toEqual([2, 3, 1])
    expect(currentItem(s)?.mockupId).toBe(2)
    expect(s.checked.has(2)).toBe(true)
  })

  it('cannot skip the last one waiting, or when the rest are stashed', () => {
    let s = singles()
    s = skip(skip(s))
    expect(s.units.map((u) => u.unitId)).toEqual([3, 1, 2])
    const lastOne = createFlow({ units: [single(1)], resume: null })
    expect(canSkip(lastOne)).toBe(false)
    const rest = { ...singles(), stashed: new Set([2, 3]) }
    expect(canSkip(rest)).toBe(false)
  })

  it('is not offered on a single that is already stashed, even with another waiting', () => {
    const reopened = { ...singles(), stashed: new Set([1]) }
    expect(canSkip(reopened)).toBe(false)
    expect(skip(reopened)).toEqual(reopened)
  })

  it('skips a single reached after the piles without touching the piles', () => {
    const s = createFlow(queue({ resume: { unitId: 30, mockupId: 30 } }))
    const skipped = skip(s)
    expect(skipped.units.map((u) => u.unitId)).toEqual([1, 2, 31, 30])
  })
})

describe('Progress', () => {
  // The queue has 7 mockups; the one you are on counts as looked at.
  it('starts with the first mockup and moves with Next', () => {
    expect(progress(start())).toBeCloseTo(1 / 7)
    expect(progress(next(start()))).toBeCloseTo(2 / 7)
  })

  it('never goes back when you go back or jump around', () => {
    const s = next(next(start()))
    expect(progress(back(s))).toBeCloseTo(progress(s))
    expect(progress(jumpTo(s, 0))).toBeCloseTo(progress(s))
  })

  it('counts a whole pile once it is stashed, and the first mockup of the next', () => {
    expect(progress(afterStash(start()))).toBeCloseTo(4 / 7)
  })

  it('moves when a single is skipped, since the next one is opened', () => {
    const s = createFlow({ units: [single(1), single(2), single(3)], resume: null })
    expect(progress(s)).toBeCloseTo(1 / 3)
    expect(progress(skip(s))).toBeCloseTo(2 / 3)
  })

  it('is 1 once everything is stashed, and 0 for an empty queue', () => {
    let s = createFlow({ units: [single(1), single(2)], resume: null })
    s = afterStash(afterStash(s))
    expect(progress(s)).toBe(1)
    expect(progress(createFlow({ units: [], resume: null }))).toBe(0)
  })
})

describe('landedDraft', () => {
  const phone = { tagId: 1, label: 'Phone', categoryId: 1, categoryLabel: 'Device' }
  const laptop = { tagId: 2, label: 'Laptop', categoryId: 1, categoryLabel: 'Device' }
  const fallback = { title: 'phone side', description: 'On a stand', tags: [phone] }
  const landed = item(2, 'variant', {
    title: 'Blue scroll Macbook',
    description: 'A long page',
    tags: [laptop]
  })

  it('shows the suggestion that landed when the form holds what main had', () => {
    const { form, saved } = landedDraft(fallback, fallback, landed)
    expect(form).toEqual({
      title: 'Blue scroll Macbook',
      description: 'A long page',
      tags: [laptop]
    })
    expect(saved).toEqual(form)
  })

  it('keeps a field the user is still editing, and records what main now has', () => {
    const typing = { ...fallback, title: 'My side' }
    const { form, saved } = landedDraft(typing, fallback, landed)
    expect(form).toEqual({ title: 'My side', description: 'A long page', tags: [laptop] })
    // Saving then counts only the title as the user's edit.
    expect(saved.title).toBe('Blue scroll Macbook')
  })

  it('keeps the fields the person took over even when they still read as main had them', () => {
    // Fill it myself: the title stays the file name, and the cleared description and tags stay clear.
    const mine = { title: 'phone side', description: '', tags: [] }
    const { form } = landedDraft(mine, fallback, landed, ['title', 'description', 'tags'])
    expect(form).toEqual(mine)
    expect(landedDraft(fallback, fallback, landed, ['title']).form.title).toBe('phone side')
  })
})
