import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb, sample } from '../db/repositories/__tests__/setup'
import { InboxService } from './inbox-service'

const ROOT = '/Users/me/Library/DesignStash'

let sqlite: Database.Database
let repo: Repository
let rm: ReturnType<typeof vi.fn<(p: string) => Promise<void>>>
let stat: ReturnType<typeof vi.fn<(p: string) => Promise<{ size: number }>>>
let inbox: InboxService

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  rm = vi.fn(async () => {})
  stat = vi.fn(async () => ({ size: 4096 }))
  inbox = new InboxService(repo, ROOT, { rm, stat })
})

afterEach(() => sqlite.close())

const imported = (name: string, extra = {}) =>
  repo.mockups.createMockup({
    ...sample,
    title: name,
    libraryPath: `${ROOT}/mockups/${name}/original.psd`,
    coverPath: `${ROOT}/mockups/${name}/cover.webp`,
    ...extra
  })

describe('list', () => {
  it('measures a PSD once and keeps the size', async () => {
    const a = imported('a')

    const first = await inbox.list('to_sort')
    expect(first[0]).toMatchObject({ id: a.id, sizeBytes: 4096 })
    expect(stat).toHaveBeenCalledWith(`${ROOT}/mockups/a/original.psd`)
    expect(repo.mockups.getMockup(a.id)?.sizeBytes).toBe(4096)

    await inbox.list('to_sort')
    expect(stat).toHaveBeenCalledTimes(1)
  })

  it('leaves the size empty when the PSD cannot be read', async () => {
    imported('a')
    stat.mockRejectedValueOnce(new Error('ENOENT'))
    expect((await inbox.list('to_sort'))[0]?.sizeBytes).toBeNull()
  })
})

describe('toss', () => {
  it('removes the records and the app copies of a pile and its members', async () => {
    const a = imported('a')
    const b = imported('b')
    repo.piles.createPile([a.id, b.id], a.id)
    repo.mockups.setStage([a.id, b.id], 'to_stash')

    const result = await inbox.toss([a.id])

    expect(result.tossedIds.sort()).toEqual([a.id, b.id].sort())
    expect(repo.mockups.getMockup(a.id)).toBeUndefined()
    expect(repo.mockups.getMockup(b.id)).toBeUndefined()
    expect(rm.mock.calls.map((c) => c[0]).sort()).toEqual(
      [
        `${ROOT}/mockups/a/original.psd`,
        `${ROOT}/mockups/a/cover.webp`,
        `${ROOT}/mockups/a/thumb.webp`,
        `${ROOT}/mockups/b/original.psd`,
        `${ROOT}/mockups/b/cover.webp`,
        `${ROOT}/mockups/b/thumb.webp`
      ].sort()
    )
  })

  it('never removes anything outside the stash folder, whatever a record points at', async () => {
    const stray = imported('stray', {
      libraryPath: '/Users/me/Desktop/original.psd',
      coverPath: '/Users/me/Desktop/cover.png'
    })
    const sneaky = imported('sneaky', {
      libraryPath: `${ROOT}/../Desktop/original.psd`,
      coverPath: `${ROOT}/mockups/sneaky/cover.webp`
    })

    await inbox.toss([stray.id, sneaky.id])

    const removed = rm.mock.calls.map((c) => c[0])
    expect(removed).not.toContain('/Users/me/Desktop/original.psd')
    expect(removed).not.toContain('/Users/me/Desktop/cover.png')
    expect(removed).not.toContain('/Users/me/Desktop/thumb.webp')
    expect(removed.every((p) => p.startsWith(`${ROOT}/`) && !p.includes('..'))).toBe(true)
    // The records still go.
    expect(repo.mockups.getMockup(stray.id)).toBeUndefined()
    expect(repo.mockups.getMockup(sneaky.id)).toBeUndefined()
  })

  it('skips mockups already in My Stash or Trash and leaves them whole', async () => {
    const fresh = imported('fresh')
    const stashed = repo.mockups.createMockup(
      approvedMockup({ title: 's', libraryPath: `${ROOT}/mockups/s/original.psd` })
    )
    const trashed = imported('t')
    repo.trash.moveToTrash(trashed.id)

    const result = await inbox.toss([fresh.id, stashed.id, trashed.id, 9999])

    expect(result.tossedIds).toEqual([fresh.id])
    expect(result.skippedIds.sort()).toEqual([stashed.id, trashed.id, 9999].sort())
    expect(repo.mockups.getMockup(stashed.id)).toBeDefined()
    expect(repo.mockups.getMockup(trashed.id)).toBeDefined()
    expect(rm.mock.calls.map((c) => c[0]).every((p) => p.includes('/mockups/fresh/'))).toBe(true)
  })

  it('takes the tossed mockups out of the counts and the search index', async () => {
    const a = imported('a')
    imported('b')
    expect(inbox.counts().toSort).toBe(2)

    await inbox.toss([a.id])

    expect(inbox.counts().toSort).toBe(1)
  })
})
