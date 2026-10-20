import { describe, expect, it } from 'vitest'
import { COVER_MAX_BYTES, coverFileProblem, coverFit, pickCover } from './cover-fit'

describe('coverFit', () => {
  it('keeps a 4:3 image whole with no note', () => {
    expect(coverFit(1600, 1200)).toEqual({ mode: 'crop', kept: 1, note: null })
  })

  it('crops when exactly 75% survives, at 1:1 and at 16:9', () => {
    expect(coverFit(1000, 1000)).toMatchObject({ mode: 'crop', kept: 0.75, note: 'Cropped to 4:3' })
    expect(coverFit(1920, 1080)).toMatchObject({ mode: 'crop', kept: 0.75, note: 'Cropped to 4:3' })
  })

  it('crops common landscape and near-square shapes', () => {
    for (const [w, h] of [
      [1500, 1000],
      [1440, 900],
      [1200, 1000],
      [1000, 900]
    ] as const) {
      expect(coverFit(w, h).mode).toBe('crop')
    }
  })

  it('uses bars when a crop would lose more than 25%', () => {
    expect(coverFit(1080, 1920)).toMatchObject({
      mode: 'bars',
      note: 'Shown whole · much taller than 4:3'
    })
    expect(coverFit(1000, 1100).mode).toBe('bars')
    expect(coverFit(3000, 1000)).toMatchObject({
      mode: 'bars',
      note: 'Shown whole · much wider than 4:3'
    })
  })

  it('switches just past the boundary', () => {
    expect(coverFit(1000, 1001).mode).toBe('bars')
    expect(coverFit(1919, 1080).mode).toBe('crop')
    expect(coverFit(1921, 1080).mode).toBe('bars')
    expect(coverFit(2561, 1080).mode).toBe('bars')
  })

  it('reports how much of the image the crop keeps', () => {
    expect(coverFit(1080, 1920).kept).toBeCloseTo(0.421875, 6)
  })

  it('treats unknown dimensions as a plain crop', () => {
    expect(coverFit(0, 0)).toEqual({ mode: 'crop', kept: 1, note: null })
    expect(coverFit(-5, 10).mode).toBe('crop')
  })
})

describe('coverFileProblem', () => {
  it('accepts PNG, JPG and WebP up to 25 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(coverFileProblem({ type, size: COVER_MAX_BYTES })).toBeNull()
    }
  })

  it('rejects other types and files over 25 MB', () => {
    expect(coverFileProblem({ type: 'image/gif', size: 10 })).toBe('not-image')
    expect(coverFileProblem({ type: 'application/pdf', size: 10 })).toBe('not-image')
    expect(coverFileProblem({ type: 'image/png', size: COVER_MAX_BYTES + 1 })).toBe('too-large')
  })
})

describe('pickCover', () => {
  const png = (name: string, size = 100) => ({ name, type: 'image/png', size })
  const text = { name: 'notes.txt', type: 'text/plain', size: 10 }

  it('takes the only image', () => {
    expect(pickCover([png('a.png')])).toMatchObject({ ok: true, ignored: 0, total: 1 })
  })

  it('uses the first image when several are dropped and counts the rest', () => {
    const result = pickCover([png('a.png'), png('b.png'), png('c.png')])
    expect(result).toMatchObject({ ok: true, ignored: 2, total: 3 })
    expect(result.ok && result.file.name).toBe('a.png')
  })

  it('skips a leading non-image', () => {
    const result = pickCover([text, png('b.png')])
    expect(result.ok && result.file.name).toBe('b.png')
  })

  it('rejects when nothing is an image', () => {
    expect(pickCover([text])).toEqual({ ok: false, problem: 'not-image' })
    expect(pickCover([])).toEqual({ ok: false, problem: 'not-image' })
  })

  it('reports an oversize image', () => {
    expect(pickCover([png('big.png', COVER_MAX_BYTES + 1)])).toEqual({
      ok: false,
      problem: 'too-large'
    })
  })
})
