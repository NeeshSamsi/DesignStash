import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { ensureSearchIndex } from '../search-index'
import { approvedMockup, createTestDb, sample } from './__tests__/setup'

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
})

afterEach(() => sqlite.close())

const imported = (title: string, extra = {}) =>
  repo.mockups.createMockup({ ...sample, title, libraryPath: `/lib/${title}.psd`, ...extra })

describe('getInboxList', () => {
  it('lists To sort in import order, with only the mockups waiting there', () => {
    const a = imported('a')
    const b = imported('b')
    const sorted = imported('sorted')
    repo.mockups.setStage([sorted.id], 'to_stash')
    repo.mockups.createMockup(approvedMockup({ title: 'stashed', libraryPath: '/lib/stashed.psd' }))

    const rows = repo.inbox.list('to_sort')

    expect(rows.map((r) => r.id)).toEqual([a.id, b.id])
    expect(rows[0]).toMatchObject({
      title: 'a',
      stage: 'to_sort',
      aiStatus: 'off',
      sizeBytes: null,
      pile: null,
      coverMissing: true
    })
  })

  it('lists To stash as piles and singles, hiding members, in sorted order', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((t) => imported(t)) as [
      ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>
    ]
    repo.piles.createPile([a.id, b.id], a.id)
    repo.mockups.setStage([d.id], 'to_stash')
    repo.mockups.setStage([a.id, b.id, c.id], 'to_stash')
    repo.mockups.updateMockup(d.id, { sortedAt: '2026-01-01T00:00:00.000Z' })
    repo.mockups.updateMockup(a.id, { sortedAt: '2026-01-02T00:00:00.000Z' })
    repo.mockups.updateMockup(c.id, { sortedAt: '2026-01-03T00:00:00.000Z' })

    const rows = repo.inbox.list('to_stash')

    expect(rows.map((r) => r.id)).toEqual([d.id, a.id, c.id])
    expect(rows[1]).toMatchObject({ pile: { memberCount: 2 } })
  })

  it('leaves out anything in Trash', () => {
    const a = imported('a')
    repo.trash.moveToTrash(a.id)
    expect(repo.inbox.list('to_sort')).toEqual([])
  })

  it('reports the AI status and size of each card', () => {
    const a = imported('a')
    repo.mockups.updateMockup(a.id, { aiStatus: 'sniffing', sizeBytes: 2048 })
    expect(repo.inbox.list('to_sort')[0]).toMatchObject({ aiStatus: 'sniffing', sizeBytes: 2048 })
  })
})

describe('getInboxCounts', () => {
  it('counts mockups in To sort, piles and singles in To stash, those still sniffing, and Trash', () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((t) => imported(t)) as [
      ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>,
      ReturnType<typeof imported>, ReturnType<typeof imported>
    ]
    repo.mockups.updateMockup(a.id, { aiStatus: 'pending' })
    repo.mockups.updateMockup(b.id, { aiStatus: 'sniffing' })
    repo.mockups.updateMockup(c.id, { aiStatus: 'ready' })
    // d and e form a pile waiting in To stash
    repo.piles.createPile([d.id, e.id], d.id)
    repo.mockups.setStage([d.id, e.id], 'to_stash')
    // a stashed mockup and a trashed one
    repo.mockups.createMockup(approvedMockup({ title: 'stashed', libraryPath: '/lib/stashed.psd' }))
    const trashed = repo.mockups.createMockup(approvedMockup({ title: 'gone', libraryPath: '/lib/gone.psd' }))
    repo.trash.moveToTrash(trashed.id)

    expect(repo.inbox.getCounts()).toEqual({ toSort: 3, toStash: 1, sniffing: 2, trash: 1 })
  })

  it('is all zeros for an empty library', () => {
    expect(repo.inbox.getCounts()).toEqual({ toSort: 0, toStash: 0, sniffing: 0, trash: 0 })
  })
})

describe('collectTossable', () => {
  it('takes a pile with its members and skips what is stashed, trashed or missing', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((t) => imported(t)) as [
      ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>
    ]
    repo.piles.createPile([a.id, b.id], a.id)
    repo.mockups.setStage([a.id, b.id], 'to_stash')
    const stashed = repo.mockups.createMockup(approvedMockup({ title: 's', libraryPath: '/lib/s.psd' }))
    const trashed = imported('t')
    repo.trash.moveToTrash(trashed.id)

    const result = repo.inbox.collectTossable([a.id, c.id, stashed.id, trashed.id, 9999, c.id])

    expect(result.ids.sort()).toEqual([a.id, b.id, c.id].sort())
    expect(result.skipped.sort()).toEqual([stashed.id, trashed.id, 9999].sort())
  })

  it('is empty for no ids', () => {
    expect(repo.inbox.collectTossable([])).toEqual({ ids: [], skipped: [] })
  })

  it('carries the import batch each card arrived in', () => {
    const a = imported('a', { importContext: { batchId: 'batch-1' } })
    const b = imported('b')
    const rows = repo.inbox.list('to_sort')
    expect(rows.find((r) => r.id === a.id)?.batchId).toBe('batch-1')
    expect(rows.find((r) => r.id === b.id)?.batchId).toBeNull()
  })
})
