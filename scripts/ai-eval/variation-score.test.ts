import { describe, expect, it } from 'vitest'
import { fileMarkers, judge } from './variation-score'

describe('judge', () => {
  it('is right on an accepted word, a "same" call, or something else', () => {
    expect(judge('Side view', { say: 'side view', accept: ['side'] })).toBe('right')
    expect(judge('same', { say: 'side view', accept: ['side'] })).toBe('same')
    expect(judge('on a blue sofa', { say: 'side view', accept: ['side'] })).toBe('other')
  })

  it('matches an accepted word from the start of a word, so "side" misses "inside"', () => {
    expect(judge('inside the box', { say: 'side view', accept: ['side'] })).toBe('other')
    expect(judge('side-on', { say: 'side view', accept: ['side'] })).toBe('right')
    expect(judge('three-quarter', { say: 'angled', accept: ['three-quarter'] })).toBe('right')
  })

  it('takes "same" as right where the mockups look the same', () => {
    expect(judge('No difference', { say: 'same', accept: [], same: true })).toBe('right')
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
    expect(fileMarkers(['Boards Environment.psd', 'Boards Isolated.psd'])).toEqual(['environment', 'isolated'])
  })

  it('leaves long numbers and mixed codes to the pile order', () => {
    expect(fileMarkers(['IMG_4821.psd', 'IMG_4822.psd'])).toEqual(['1', '2'])
    expect(fileMarkers(['Mockup M003T1513.psd', 'Mockup M003T1514.psd'])).toEqual(['1', '2'])
  })

  it('numbers them in pile order when the names give no marker, or the same one twice', () => {
    expect(fileMarkers(['x-1513-a.psd', 'x-1513-b.psd', 'x-1514-a.psd'])).toEqual(['1', '2', '3'])
    expect(fileMarkers(['scene.psd', 'scene copy.psd'])).toEqual(['1', '2'])
  })
})
