import { describe, expect, it } from 'vitest'
import {
  absentWords,
  checkAnswer,
  compileAbsent,
  labelSupported,
  summarise,
  supportWords
} from './hallucination'

describe('compileAbsent', () => {
  it('compiles each fragment as a case-insensitive regex', () => {
    const [re] = compileAbsent(['flexib|foldab'])
    expect(re!.test('A FOLDABLE phone')).toBe(true)
  })

  it('names the fragment that does not compile', () => {
    expect(() => compileAbsent(['ok', 'bad('])).toThrow(/bad\(/)
  })
})

describe('absentWords', () => {
  it('gives each whole word a fragment matched, once, in lower case', () => {
    const patterns = compileAbsent(['flexib|foldab|curl', 'chair'])
    expect(
      absentWords('Flexible phone on a chair. A flexible, curled screen.', patterns).sort()
    ).toEqual(['chair', 'curled', 'flexible'])
  })

  it('honours word boundaries in a fragment', () => {
    const patterns = compileAbsent(['\\bwrist'])
    expect(absentWords('A smartwatch on a wrist', patterns)).toEqual(['wrist'])
    expect(absentWords('Wristband and armwrist', compileAbsent(['\\bwrist']))).toEqual([
      'wristband'
    ])
  })

  it('keeps a phrase a fragment spans whole', () => {
    expect(absentWords('Cap hanging on a hook', compileAbsent(['on a hook']))).toEqual([
      'on a hook'
    ])
  })

  it('finds nothing with no fragments, and skips fragments that match empty text', () => {
    expect(absentWords('anything', [])).toEqual([])
    expect(absentWords('anything', compileAbsent(['x*']))).toEqual([])
  })
})

describe('labelSupported', () => {
  const words = supportWords({
    title: 'T-shirts on hangers',
    description: 'Two folded tee shirts and a hand-held phone in a glass box.',
    tags: [{ category: 'Style', label: '3D render' }]
  })

  it('needs every word of the label in the gold text', () => {
    expect(labelSupported('Glass box', words)).toBe(true)
    expect(labelSupported('Wooden box', words)).toBe(false)
  })

  it('ignores case, hyphens and plurals on both sides', () => {
    expect(labelSupported('t-shirt', words)).toBe(true)
    expect(labelSupported('T shirt', words)).toBe(true)
    expect(labelSupported('Tshirt', words)).toBe(true)
    expect(labelSupported('Hanger', words)).toBe(true)
    expect(labelSupported('Boxes', words)).toBe(true)
    expect(labelSupported('Handheld', words)).toBe(true)
    expect(labelSupported('3d renders', words)).toBe(true)
  })

  it('skips filler and is null for a label with no words left', () => {
    expect(labelSupported('Box & glass', words)).toBe(true)
    expect(labelSupported('&', words)).toBeNull()
  })
})

describe('checkAnswer', () => {
  const gold = {
    title: 'Cap on a table',
    description: 'A baseball cap on a wooden table.',
    tags: [{ category: 'Apparel', label: 'Cap' }],
    absent: ['hang|hook', 'desk']
  }

  it('matches absent words in the title, description, tag labels and keywords', () => {
    const check = checkAnswer(
      {
        id: 'cap',
        repeat: 1,
        title: 'Cap hanging',
        description: 'A cap.',
        keywords: ['desk']
      },
      ['Cap', 'Hook'],
      gold
    )
    expect(check).toMatchObject({ id: 'cap', repeat: 1, absentChecked: true })
    expect(check.absentWords.sort()).toEqual(['desk', 'hanging', 'hook'])
  })

  it('does not match across fields', () => {
    const check = checkAnswer(
      { id: 'cap', repeat: 0, title: 'Cap on a', description: 'hook stand' },
      [],
      { ...gold, absent: ['a hook'] }
    )
    expect(check.absentWords).toEqual([])
  })

  it('counts saved labels the gold text supports', () => {
    const check = checkAnswer(
      { id: 'cap', repeat: 0, title: 'Cap', description: '' },
      ['Caps', 'Wooden table', 'Outdoor', '&'],
      gold
    )
    expect(check).toMatchObject({ labels: 3, supported: 2, unsupported: ['Outdoor'] })
  })

  it('checks no absent words when gold has no list', () => {
    const noList = { title: gold.title, description: gold.description, tags: gold.tags }
    const check = checkAnswer({ id: 'cap', repeat: 0, title: 'Desk', description: '' }, [], noList)
    expect(check).toMatchObject({ absentChecked: false, absentWords: [] })
  })
})

describe('summarise', () => {
  const answer = (absentChecked: boolean, words: string[], labels: number, supported: number) => ({
    id: 'x',
    repeat: 0,
    absentChecked,
    absentWords: words,
    labels,
    supported,
    unsupported: []
  })

  it('shares and means over answers with an absent list; tag support over all labels', () => {
    expect(
      summarise([
        answer(true, ['hook', 'desk'], 4, 3),
        answer(true, [], 2, 2),
        answer(false, ['ignored'], 4, 0)
      ])
    ).toEqual({ answers: 2, hallucinated: 0.5, absentPerAnswer: 1, labels: 10, tagSupport: 0.5 })
  })

  it('is all zero with nothing to check', () => {
    expect(summarise([])).toEqual({
      answers: 0,
      hallucinated: 0,
      absentPerAnswer: 0,
      labels: 0,
      tagSupport: 0
    })
  })
})
