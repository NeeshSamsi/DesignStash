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
  repo.createMockup({ ...sample, title, libraryPath: `/lib/${title}.psd`, ...extra })

describe('getInboxList', () => {
  it('lists To sort in import order, with only the mockups waiting there', () => {
    const a = imported('a')
    const b = imported('b')
    const sorted = imported('sorted')
    repo.setStage([sorted.id], 'to_stash')
    repo.createMockup(approvedMockup({ title: 'stashed', libraryPath: '/lib/stashed.psd' }))

    const rows = repo.getInboxList('to_sort')

    expect(rows.map((r) => r.id)).toEqual([a.id, b.id])
    expect(rows[0]).toMatchObject({
      title: 'a',
      stage: 'to_sort',
      aiStatus: 'off',
      sizeBytes: null,
      isGroup: false,
      variantCount: 0,
      coverMissing: true
    })
  })

  it('lists To stash as piles and singles, hiding members, in sorted order', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((t) => imported(t)) as [
      ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>
    ]
    repo.createPile([a.id, b.id], a.id)
    repo.setStage([d.id], 'to_stash')
    repo.setStage([a.id, b.id, c.id], 'to_stash')
    repo.updateMockup(d.id, { sortedAt: '2026-01-01T00:00:00.000Z' })
    repo.updateMockup(a.id, { sortedAt: '2026-01-02T00:00:00.000Z' })
    repo.updateMockup(c.id, { sortedAt: '2026-01-03T00:00:00.000Z' })

    const rows = repo.getInboxList('to_stash')

    expect(rows.map((r) => r.id)).toEqual([d.id, a.id, c.id])
    expect(rows[1]).toMatchObject({ isGroup: true, variantCount: 1, topId: a.id })
  })

  it('leaves out anything in Trash', () => {
    const a = imported('a')
    repo.moveToTrash(a.id)
    expect(repo.getInboxList('to_sort')).toEqual([])
  })

  it('reports the AI status and size of each card', () => {
    const a = imported('a')
    repo.updateMockup(a.id, { aiStatus: 'sniffing', sizeBytes: 2048 })
    expect(repo.getInboxList('to_sort')[0]).toMatchObject({ aiStatus: 'sniffing', sizeBytes: 2048 })
  })
})

describe('getInboxCounts', () => {
  it('counts mockups in To sort, piles and singles in To stash, those still sniffing, and Trash', () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((t) => imported(t)) as [
      ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>,
      ReturnType<typeof imported>, ReturnType<typeof imported>
    ]
    repo.updateMockup(a.id, { aiStatus: 'pending' })
    repo.updateMockup(b.id, { aiStatus: 'sniffing' })
    repo.updateMockup(c.id, { aiStatus: 'ready' })
    // d and e form a pile waiting in To stash
    repo.createPile([d.id, e.id], d.id)
    repo.setStage([d.id, e.id], 'to_stash')
    // a stashed mockup and a trashed one
    repo.createMockup(approvedMockup({ title: 'stashed', libraryPath: '/lib/stashed.psd' }))
    const trashed = repo.createMockup(approvedMockup({ title: 'gone', libraryPath: '/lib/gone.psd' }))
    repo.moveToTrash(trashed.id)

    expect(repo.getInboxCounts()).toEqual({ toSort: 3, toStash: 1, sniffing: 2, trash: 1 })
  })

  it('is all zeros for an empty library', () => {
    expect(repo.getInboxCounts()).toEqual({ toSort: 0, toStash: 0, sniffing: 0, trash: 0 })
  })
})

describe('collectTossable', () => {
  it('takes a pile with its members and skips what is stashed, trashed or missing', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((t) => imported(t)) as [
      ReturnType<typeof imported>, ReturnType<typeof imported>, ReturnType<typeof imported>
    ]
    repo.createPile([a.id, b.id], a.id)
    repo.setStage([a.id, b.id], 'to_stash')
    const stashed = repo.createMockup(approvedMockup({ title: 's', libraryPath: '/lib/s.psd' }))
    const trashed = imported('t')
    repo.moveToTrash(trashed.id)

    const result = repo.collectTossable([a.id, c.id, stashed.id, trashed.id, 9999, c.id])

    expect(result.ids.sort()).toEqual([a.id, b.id, c.id].sort())
    expect(result.skipped.sort()).toEqual([stashed.id, trashed.id, 9999].sort())
  })

  it('is empty for no ids', () => {
    expect(repo.collectTossable([])).toEqual({ ids: [], skipped: [] })
  })
})
