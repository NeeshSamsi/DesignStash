import { describe, expect, it } from 'vitest'
import { checkFormat, headline, itemFindRates, scoreQuery } from './scoring'

describe('scoreQuery', () => {
  it('counts recall and precision against the relevant items', () => {
    const s = scoreQuery({ q: 'tote bag', relevant: ['a', 'b'] }, ['a', 'x', 'y', 'z'])
    expect(s.recall).toBe(0.5)
    expect(s.precision).toBe(0.25)
    expect(s.missed).toEqual(['b'])
  })

  it('wants every relevant item in the top max(3, relevant) results', () => {
    expect(scoreQuery({ q: 'q', relevant: ['a'] }, ['x', 'y', 'a']).allInTop).toBe(true)
    expect(scoreQuery({ q: 'q', relevant: ['a'] }, ['x', 'y', 'z', 'a']).allInTop).toBe(false)
    const four = ['a', 'b', 'c', 'd']
    expect(scoreQuery({ q: 'q', relevant: four }, ['x', 'a', 'b', 'c', 'd']).allInTop).toBe(false)
    expect(scoreQuery({ q: 'q', relevant: four }, ['d', 'c', 'b', 'a', 'x']).allInTop).toBe(true)
  })

  it('scores an empty result as nothing found, and keeps a search error', () => {
    const s = scoreQuery({ q: 't-shirt', relevant: ['a'] }, [], 'no such column: shirt')
    expect(s).toMatchObject({
      recall: 0,
      precision: 0,
      allInTop: false,
      error: 'no such column: shirt'
    })
  })
})

describe('headline', () => {
  it('averages over queries, each counting the same', () => {
    const scores = [
      scoreQuery({ q: 'one', relevant: ['a'] }, ['a']),
      scoreQuery({ q: 'four', relevant: ['a', 'b', 'c', 'd'] }, [])
    ]
    expect(headline(scores)).toEqual({ queries: 2, recall: 0.5, precision: 0.5, allInTop: 0.5 })
  })

  it('is all zero with no queries', () => {
    expect(headline([])).toEqual({ queries: 0, recall: 0, precision: 0, allInTop: 0 })
  })
})

describe('itemFindRates', () => {
  it('is the share of the queries wanting an item that return it', () => {
    const rates = itemFindRates([
      scoreQuery({ q: 'bag', relevant: ['a', 'b'] }, ['a']),
      scoreQuery({ q: 'tote', relevant: ['a'] }, ['b'])
    ])
    expect(rates).toEqual({
      a: { queries: 2, found: 1, rate: 0.5 },
      b: { queries: 1, found: 0, rate: 0 }
    })
  })
})

describe('checkFormat', () => {
  const result = (title: string, description = '', labels: string[] = ['Tote bag']) => ({
    title,
    description,
    tags: labels.map((label) => ({ category: 'Apparel', label }))
  })

  it('passes a plain title', () => {
    expect(
      checkFormat(result('Tote bag on a wooden floor'), { fileName: 'Free_Tote_Bag.psd' })
    ).toEqual({
      titleLength: 26,
      titleCodeStyle: false,
      junk: [],
      titleSaysNothing: false,
      genericWords: [],
      tagCount: 1,
      duplicateTags: []
    })
  })

  it('flags titles written like file names', () => {
    expect(checkFormat(result('Free_Tote_Bag'), { fileName: 'x.psd' }).titleCodeStyle).toBe(true)
    expect(checkFormat(result('tote-bag-mockup'), { fileName: 'x.psd' }).titleCodeStyle).toBe(true)
    expect(checkFormat(result('T-shirt on a hanger'), { fileName: 'x.psd' }).titleCodeStyle).toBe(
      false
    )
  })

  it('finds file-name junk in the title and description', () => {
    const check = checkFormat(
      result('Free PSD brochure', 'Floating-Z-Fold-Brand-Brochure from Pixeden, TOJ8V2I9.'),
      { fileName: 'Floating-Z-Fold-Brand-Brochure.psd', zipName: 'Floating Z Fold Brand Brochure' }
    )
    expect(check.junk.sort()).toEqual(
      ['Floating-Z-Fold-Brand-Brochure', 'free', 'pixeden', 'psd', 'toj8v2i9'].sort()
    )
  })

  it('finds the zip name repeated', () => {
    const check = checkFormat(result('Free Cap Mockup'), {
      fileName: 'Cap.psd',
      zipName: 'Free Cap Mockup'
    })
    expect(check.junk).toContain('Free Cap Mockup')
  })

  it('leaves device names that look like codes alone', () => {
    expect(checkFormat(result('iPhone15 in a hand'), { fileName: 'x.psd' }).junk).toEqual([])
  })

  it('flags a title that only says mockup', () => {
    const check = checkFormat(result('A free mockup'), { fileName: 'x.psd' })
    expect(check.titleSaysNothing).toBe(true)
    expect(check.genericWords).toEqual(['free', 'mockup'])
  })

  it('counts tags and finds labels given twice', () => {
    const check = checkFormat(result('Bag', '', ['Tote bag', 'tote-bag', 'Indoor']), {
      fileName: 'x.psd'
    })
    expect(check.tagCount).toBe(3)
    expect(check.duplicateTags).toEqual(['tote bag'])
  })
})
