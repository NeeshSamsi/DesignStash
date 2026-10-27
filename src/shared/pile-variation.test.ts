import { describe, expect, it } from 'vitest'
import {
  fallbackVariations,
  fileMarkers,
  fullTitle,
  latinLookalikes,
  numberRepeats,
  saysSame,
  tidyWords,
  variationHeading
} from './pile-variation'

describe('fullTitle', () => {
  it('joins the base and the variation with a dot', () => {
    expect(fullTitle('Long scroll MacBook', { words: 'wavy surface' })).toBe('Long scroll MacBook · wavy surface')
  })

  it('is the title alone for a mockup on its own', () => {
    expect(fullTitle('Clay iPhone 15 Pro', null)).toBe('Clay iPhone 15 Pro')
  })
})

describe('variationHeading', () => {
  it('starts a variation shown on its own with a capital, keeping the rest as written', () => {
    expect(variationHeading('side view')).toBe('Side view')
    expect(variationHeading('EU')).toBe('EU')
    expect(variationHeading('2')).toBe('2')
  })
})

describe('tidyWords', () => {
  it('trims and folds runs of spaces', () => {
    expect(tidyWords('  side   view ')).toBe('side view')
  })
})

describe('fileMarkers', () => {
  it("gives each mockup the short part of its file name the others don't share", () => {
    expect(fileMarkers(['oval-mug-mockup-1.psd', 'oval-mug-mockup-2.psd', 'oval-mug-mockup-3.psd'])).toEqual(['1', '2', '3'])
    expect(fileMarkers(['tote-a.psd', 'tote-b.psd'])).toEqual(['A', 'B'])
  })

  it('takes a short word that sets a name apart, keeping capitals only for an abbreviation', () => {
    expect(fileMarkers(['Free_Notebook_Mockup_EU.psd', 'Free_Notebook_Mockup_US.psd'])).toEqual(['EU', 'US'])
    expect(fileMarkers(['Apple Watch Ultra - Clay, PSD.psd', 'Apple Watch Ultra - Realistic, PSD.psd'])).toEqual(['clay', 'realistic'])
  })

  it('numbers them in pile order when the names give no marker, or the same one twice', () => {
    expect(fileMarkers(['IMG_4821.psd', 'IMG_4822.psd'])).toEqual(['1', '2'])
    expect(fileMarkers(['x-1513-a.psd', 'x-1513-b.psd', 'x-1514-a.psd'])).toEqual(['1', '2', '3'])
  })
})

describe('latinLookalikes: Cyrillic and Greek letters that look Latin, in a Latin name (F-077)', () => {
  it('writes a lookalike inside a Latin word as the Latin letter ("Сlay", with a Cyrillic С, to "Clay")', () => {
    expect(latinLookalikes('Apple Watch Ultra - \u0421lay')).toBe('Apple Watch Ultra - Clay')
    expect(latinLookalikes('m\u043eckup_\u0391pple')).toBe('mockup_Apple')
  })

  it('writes a word of lookalikes alone as Latin when the name has Latin words too ("tote-С")', () => {
    expect(latinLookalikes('tote-\u0421.psd')).toBe('tote-C.psd')
  })

  it('leaves a name written in Cyrillic or Greek as it is', () => {
    expect(latinLookalikes('Москва mockup.psd')).toBe('Москва mockup.psd')
    expect(latinLookalikes('Сок.psd')).toBe('Сок.psd')
    expect(latinLookalikes('Αθήνα poster')).toBe('Αθήνα poster')
  })

  it('makes the same file marker as the Latin name would, so a search for it finds it', () => {
    expect(fileMarkers(['Apple-Watch-Realistic.psd', 'Apple-Watch-\u0421lay.psd'])).toEqual(['realistic', 'clay'])
  })
})

describe('fallbackVariations', () => {
  it('says where each came from: a file marker, or the number in the pile', () => {
    expect(fallbackVariations(['tote-a.psd', 'tote-b.psd'])).toEqual([
      { words: 'A', source: 'marker' },
      { words: 'B', source: 'marker' }
    ])
    // A number in the name is the name's own marker.
    expect(fallbackVariations(['mug-1.psd', 'mug-2.psd']).map((v) => v.source)).toEqual(['marker', 'marker'])
    expect(
      fallbackVariations([
        'M003T1513 A long scroll Macbook Mockup 08Agu25.psd',
        'M003T1513 B long scroll Macbook Mockup 08Agu25.psd',
        'M003T1514 A long scroll Macbook Mockup 08Agu25.psd'
      ])
    ).toEqual([
      { words: '1', source: 'number' },
      { words: '2', source: 'number' },
      { words: '3', source: 'number' }
    ])
  })
})

describe('numberRepeats: two mockups with the same words', () => {
  it('lets the first in pile order keep them and numbers the next ("side", "side 2", "side 3")', () => {
    expect(numberRepeats([], ['side', 'front', 'side', 'side'])).toEqual(['side', 'front', 'side 2', 'side 3'])
  })

  it('numbers the words landing when a mockup already has them, typed or written before', () => {
    expect(numberRepeats(['side'], ['side', 'top'])).toEqual(['side 2', 'top'])
  })

  it('counts words that differ only by case or spacing as the same', () => {
    expect(numberRepeats(['Side  view'], ['side view'])).toEqual(['side view 2'])
  })

  it('skips a number already taken', () => {
    expect(numberRepeats(['side', 'side 2'], ['side'])).toEqual(['side 3'])
  })
})

describe('saysSame', () => {
  it('hears "same" and its kin, and nothing else', () => {
    for (const said of ['same', 'The same', 'no difference', 'identical', 'N/A', '']) expect(saysSame(said), said).toBe(true)
    for (const said of ['side view', 'sameness check', 'open']) expect(saysSame(said), said).toBe(false)
  })
})
