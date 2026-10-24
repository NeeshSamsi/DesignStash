import { describe, expect, it } from 'vitest'
import { fileMarkers, judge } from './variation-score'

describe('judge', () => {
  it('is right on an accepted word, a "same" call, or something else', () => {
    expect(judge('Side view', { say: 'side view', accept: ['side'] })).toBe('right')
    expect(judge('same', { say: 'side view', accept: ['side'] })).toBe('same')
    expect(judge('on a blue sofa', { say: 'side view', accept: ['side'] })).toBe('other')
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

  it('numbers them in pile order when the names give no marker, or the same one twice', () => {
    expect(fileMarkers(['x-1513-a.psd', 'x-1513-b.psd', 'x-1514-a.psd'])).toEqual(['1', '2', '3'])
    expect(fileMarkers(['scene.psd', 'scene copy.psd'])).toEqual(['1', '2'])
  })
})
