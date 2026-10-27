import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb, sample } from '../db/repositories/__tests__/setup'
import { InboxService } from './inbox-service'

const ROOT = '/Users/me/Library/DesignStash'

let sqlite: Database.Database
let repo: Repository
let stat: ReturnType<typeof vi.fn<(p: string) => Promise<{ size: number }>>>
let inbox: InboxService

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  stat = vi.fn(async () => ({ size: 4096 }))
  inbox = new InboxService(repo, { stat })
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
  it('moves a pile to Trash, marked with the inbox it came from', async () => {
    const a = imported('a')
    const b = imported('b')
    repo.piles.createPile([a.id, b.id], a.id)
    repo.mockups.setStage([a.id, b.id], 'to_stash')

    const result = await inbox.toss([a.id])

    expect(result.tossedIds.sort()).toEqual([a.id, b.id].sort())
    expect(repo.mockups.getMockup(a.id)).toMatchObject({ trashOrigin: 'to-stash' })
    expect(repo.mockups.getMockup(a.id)?.deletedAt).not.toBeNull()
    expect(repo.trash.getTrashEntries().map((e) => e.ids.sort())).toEqual([[a.id, b.id].sort()])
  })

  it('marks a mockup tossed from To sort as from To sort', async () => {
    const fresh = imported('fresh')
    await inbox.toss([fresh.id])
    expect(repo.mockups.getMockup(fresh.id)).toMatchObject({ trashOrigin: 'to-sort' })
  })

  it('skips mockups already in My Stash or Trash and leaves them whole', async () => {
    const fresh = imported('fresh')
    const stashed = repo.mockups.createMockup(
      approvedMockup({ title: 's', libraryPath: `${ROOT}/mockups/s/original.psd` })
    )
    const trashed = imported('t')
    repo.trash.moveToTrash(trashed.id)
    const trashedAt = repo.mockups.getMockup(trashed.id)?.deletedAt

    const result = await inbox.toss([fresh.id, stashed.id, trashed.id, 9999])

    expect(result.tossedIds).toEqual([fresh.id])
    expect(result.skippedIds.sort()).toEqual([stashed.id, trashed.id, 9999].sort())
    expect(repo.mockups.getMockup(stashed.id)?.deletedAt).toBeNull()
    expect(repo.mockups.getMockup(trashed.id)?.deletedAt).toBe(trashedAt)
  })
})
