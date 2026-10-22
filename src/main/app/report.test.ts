import { describe, it, expect } from 'vitest'
import { buildReport, type ReportFacts } from './report'

const facts: ReportFacts = {
  version: '0.4.0',
  electron: '41.0.0',
  platform: 'darwin',
  arch: 'arm64',
  osRelease: '27.2.0',
  stashCount: 128,
  toSort: 3,
  toStash: 2,
  trash: 1,
  stashCheck: 'in-sync',
  aiModel: 'qwen3-vl-4b'
}

describe('buildReport', () => {
  it('lists versions, system and counts', () => {
    const text = buildReport(facts)
    expect(text).toContain('Version: 0.4.0')
    expect(text).toContain('System: darwin arm64 27.2.0')
    expect(text).toContain('Mockups in My Stash: 128')
    expect(text).toContain('To sort: 3, To stash: 2, Trash: 1')
  })

  it('says the counts are unavailable when the library did not open', () => {
    const text = buildReport({
      ...facts,
      stashCount: null,
      toSort: null,
      toStash: null,
      trash: null
    })
    expect(text).toContain('Mockups in My Stash: unavailable')
    expect(text).toContain('To sort: unavailable, To stash: unavailable, Trash: unavailable')
  })

  it('scrubs any path that slips in', () => {
    const text = buildReport({
      ...facts,
      aiModel: '/Users/me/Library/models/x.gguf',
      stashCheck: 'file:///Users/me/a'
    })
    expect(text).not.toContain('/Users')
    expect(text).not.toContain('file://')
    expect(text).toContain('<path>')
  })
})
