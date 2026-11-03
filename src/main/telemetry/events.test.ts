import { describe, expect, it, vi } from 'vitest'
import { createImportCompletedReporter, reportFirstSuggestion, resultsBucket } from './events'

const haul = (state: 'running' | 'done', landed = 0) => ({
  haulId: 'h1',
  state,
  landed,
  total: 5,
  skipped: { notPsd: 1, duplicate: 1 }
})

describe('createImportCompletedReporter', () => {
  it('sends once, when the haul is done, with counts and the time taken', () => {
    const track = vi.fn()
    let t = 1000
    const report = createImportCompletedReporter(track, () => t)
    report(haul('running'))
    t = 4500
    report(haul('done', 3))
    report(haul('done', 3))
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('import_completed', { files: 3, skipped: 2, duration_ms: 3500 })
  })

  it('sends nothing for a haul that is cancelled', () => {
    const track = vi.fn()
    const report = createImportCompletedReporter(track)
    report({ ...haul('running'), state: 'cancelled' })
    expect(track).not.toHaveBeenCalled()
  })
})

describe('reportFirstSuggestion', () => {
  const store = (sent: string | null = null) => {
    const state = { installedAt: '2026-10-22T10:00:00.000Z', firstSuggestionSentAt: sent }
    return {
      state,
      get: () => state,
      update: (p: { firstSuggestionSentAt: string }) => Object.assign(state, p)
    }
  }

  it('sends the seconds since install once, then remembers', () => {
    const track = vi.fn()
    const s = store()
    const now = () => new Date('2026-10-22T10:05:00.000Z')
    reportFirstSuggestion(s, track, now)
    reportFirstSuggestion(s, track, now)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('first_suggestion', { seconds_since_install: 300 })
    expect(s.state.firstSuggestionSentAt).toBe('2026-10-22T10:05:00.000Z')
  })

  it('does nothing when it was already sent', () => {
    const track = vi.fn()
    reportFirstSuggestion(store('2026-10-01T00:00:00.000Z'), track)
    expect(track).not.toHaveBeenCalled()
  })
})

describe('resultsBucket', () => {
  it('groups counts into ranges', () => {
    expect([0, 3, 20, 100, 500, 5000].map(resultsBucket)).toEqual(['0', '1-9', '10-49', '50-199', '200-999', '1000+'])
  })
})
