import { describe, expect, it } from 'vitest'
import type { Variant } from '@shared/library'
import { addedOn, detailsCaption, pileOrder } from './details-model'

const now = new Date('2026-10-20T12:00:00')

describe('details model', () => {
  it('writes the day and month, adding the year only for another year', () => {
    expect(addedOn('2026-10-12T09:00:00', now)).toBe('12 Oct')
    expect(addedOn('2025-03-02T09:00:00', now)).toBe('2 Mar 2025')
    expect(addedOn('nonsense', now)).toBe('')
  })

  it('names the pile under a mockup in it: Top of … or Variant in … (D3.2)', () => {
    const inPile = {
      id: 2,
      title: 'Clay iPhone 15 Pro',
      createdAt: '2026-10-12T09:00:00',
      pile: null,
      pileId: 1
    }
    expect(detailsCaption(inPile, 'mockup', now)).toBe(
      'Variant in Clay iPhone 15 Pro · added 12 Oct'
    )
    expect(detailsCaption({ ...inPile, id: 1 }, 'top', now)).toBe(
      'Top of Clay iPhone 15 Pro · added 12 Oct'
    )
  })

  it('captions a mockup, a pile and the top mockup of a pile', () => {
    const item = {
      id: 1,
      title: 'a',
      pileId: null,
      createdAt: '2026-10-12T09:00:00',
      pile: { memberCount: 4 }
    }
    expect(detailsCaption(item, 'mockup', now)).toBe('Mockup · added 12 Oct')
    expect(detailsCaption(item, 'top', now)).toBe('Top mockup · added 12 Oct')
    expect(detailsCaption(item, 'pile', now)).toBe('Pile · 4 mockups')
    expect(detailsCaption({ ...item, createdAt: 'x' }, 'mockup', now)).toBe('Mockup')
  })

  it('lists the top mockup first and keeps the rest in order', () => {
    const v = (id: number, isTop: boolean): Variant => ({
      id,
      title: `V${id}`,
      variation: null,
      coverPath: '',
      coverMissing: false,
      coverSource: 'embedded',
      isTop
    })
    expect(pileOrder([v(1, false), v(2, true), v(3, false)]).map((x) => x.id)).toEqual([2, 1, 3])
  })
})
