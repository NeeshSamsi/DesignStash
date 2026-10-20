import { describe, expect, it } from 'vitest'
import { coverDisplay } from './library'

describe('coverDisplay', () => {
  it('shows a missing file before anything else', () => {
    expect(coverDisplay({ coverMissing: true, coverSource: 'none' }, true)).toBe('cover-missing')
  })

  it('shows no preview before selection', () => {
    expect(coverDisplay({ coverMissing: false, coverSource: 'none' }, true)).toBe('no-preview')
  })

  it('falls back to selected or default', () => {
    const item = { coverMissing: false, coverSource: 'embedded' } as const
    expect(coverDisplay(item, true)).toBe('selected')
    expect(coverDisplay(item)).toBe('default')
  })
})
