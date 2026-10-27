import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { TrashService } from './trash-service'

const ROOT = '/Users/me/Library/DesignStash'

let sqlite: Database.Database
let repo: Repository
let rm: ReturnType<typeof vi.fn<(p: string) => Promise<void>>>
let stat: ReturnType<typeof vi.fn<(p: string) => Promise<{ size: number }>>>
let missingFiles: Set<string>
let trash: TrashService

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  rm = vi.fn(async () => {})
  stat = vi.fn(async () => ({ size: 1000 }))
  missingFiles = new Set()
  trash = new TrashService(repo, ROOT, {
    rm,
    stat,
    exists: async (p) => !missingFiles.has(p),
    readdir: async () => [],
    rmdir: async () => {}
  })
})

afterEach(() => sqlite.close())

const make = (name: string, extra = {}) =>
  repo.mockups.createMockup(
    approvedMockup({
      title: name,
      libraryPath: `${ROOT}/mockups/${name}/original.psd`,
      coverPath: `${ROOT}/mockups/${name}/cover.webp`,
      ...extra
    })
  )

/** A pile of two, trashed together. */
const trashedPile = (name: string) => {
  const top = make(name, { isGroup: true })
  const side = make(`${name}-side`, { groupId: top.id })
  repo.trash.moveManyToTrash([top.id])
  return { top, side }
}

describe('list and stats', () => {
  it('lists newest first with when it was trashed and the size of a whole pile', async () => {
    const { top, side } = trashedPile('pile')
    const single = make('single')
    repo.mockups.updateMockup(top.id, { deletedAt: '2026-01-01T10:00:00.000Z' })
    repo.mockups.updateMockup(single.id, { deletedAt: '2026-02-01T10:00:00.000Z' })

    const items = await trash.list()

    expect(items.map((i) => i.id)).toEqual([single.id, top.id])
    expect(items[0]).toMatchObject({ trashedAt: '2026-02-01T10:00:00.000Z', sizeBytes: 1000 })
    expect(items[1]).toMatchObject({ pile: { memberCount: 2 }, sizeBytes: 2000 })
    expect(stat).toHaveBeenCalledWith(`${ROOT}/mockups/pile-side/original.psd`)
    expect(repo.mockups.getMockup(side.id)?.sizeBytes).toBe(1000)
  })

  it('says where each item came from, so Trash can read “Tossed from To sort”', async () => {
    const tossed = make('tossed')
    repo.mockups.setStage([tossed.id], 'to_sort')
    repo.trash.moveManyToTrash([tossed.id])
    const fromStash = make('kept')
    repo.trash.moveManyToTrash([fromStash.id])

    const origins = new Map((await trash.list()).map((i) => [i.id, i.origin]))
    expect(origins.get(tossed.id)).toBe('to-sort')
    expect(origins.get(fromStash.id)).toBe('my-stash')
  })

  it('counts piles and singles once each and adds up the bytes', async () => {
    trashedPile('pile')
    repo.trash.moveManyToTrash([make('single').id])

    expect(await trash.stats()).toEqual({ count: 2, bytes: 3000 })
  })

  it('counts a PSD it cannot measure as 0 bytes', async () => {
    repo.trash.moveManyToTrash([make('a').id])
    stat.mockRejectedValueOnce(new Error('ENOENT'))
    expect(await trash.stats()).toEqual({ count: 1, bytes: 0 })
  })

  it('is empty when Trash is empty', async () => {
    expect(await trash.list()).toEqual([])
    expect(await trash.stats()).toEqual({ count: 0, bytes: 0 })
  })
})

describe('restore', () => {
  it('brings back a pile whole', async () => {
    const { top } = trashedPile('pile')

    const result = await trash.restore([top.id])

    expect(result).toEqual({ restoredIds: [top.id], missing: [] })
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([top.id])
    expect(repo.trash.getTrash()).toEqual([])
  })

  it('leaves an item in Trash and reports it when its PSD is gone', async () => {
    const ok = make('ok')
    const gone = make('gone')
    repo.trash.moveManyToTrash([ok.id, gone.id])
    missingFiles.add(`${ROOT}/mockups/gone/original.psd`)

    const result = await trash.restore([ok.id, gone.id])

    expect(result).toEqual({ restoredIds: [ok.id], missing: [gone.id] })
    expect(repo.mockups.getMockup(gone.id)?.deletedAt).not.toBeNull()
    expect(repo.mockups.getMockup(ok.id)?.deletedAt).toBeNull()
  })

  it('treats a pile with any PSD gone as missing, and restores none of it', async () => {
    const { top, side } = trashedPile('pile')
    missingFiles.add(side.libraryPath)

    const result = await trash.restore([top.id])

    expect(result).toEqual({ restoredIds: [], missing: [top.id] })
    expect(repo.mockups.getMockup(top.id)?.deletedAt).not.toBeNull()
  })

  it('ignores ids that are not in Trash', async () => {
    const live = make('live')
    const result = await trash.restore([live.id, 9999])
    expect(result).toEqual({ restoredIds: [], missing: [] })
  })

  it('restore all returns the ids so Undo can put them back', async () => {
    const a = make('a')
    const b = make('b')
    repo.trash.moveManyToTrash([a.id, b.id])

    const { restoredIds, missing } = await trash.restoreAll()

    expect(restoredIds.sort()).toEqual([a.id, b.id].sort())
    expect(missing).toEqual([])
    // Undo is a bulk move back to Trash.
    repo.trash.moveManyToTrash(restoredIds)
    expect(repo.trash.getTrash()).toHaveLength(2)
  })
})

describe('empty', () => {
  it('deletes every record and the app copies, and says how much it freed', async () => {
    const { top, side } = trashedPile('pile')
    const single = make('single')
    repo.trash.moveManyToTrash([single.id])
    const keep = make('keep')

    const result = await trash.empty()

    expect(result).toEqual({ deletedCount: 2, bytesFreed: 3000 })
    for (const id of [top.id, side.id, single.id])
      expect(repo.mockups.getMockup(id)).toBeUndefined()
    expect(repo.mockups.getMockup(keep.id)).toBeDefined()
    expect(rm).toHaveBeenCalledWith(`${ROOT}/mockups/pile/original.psd`)
    expect(rm).toHaveBeenCalledWith(`${ROOT}/mockups/pile-side/original.psd`)
    expect(rm).toHaveBeenCalledWith(`${ROOT}/mockups/single/original.psd`)
    expect(rm.mock.calls.every(([p]) => !p.includes('/keep/'))).toBe(true)
  })

  it('does nothing for an empty Trash', async () => {
    expect(await trash.empty()).toEqual({ deletedCount: 0, bytesFreed: 0 })
    expect(rm).not.toHaveBeenCalled()
  })

  it('never touches files outside the stash folder', async () => {
    const m = make('desk', {
      libraryPath: '/Users/me/Desktop/original.psd',
      coverPath: '/Users/me/Desktop/c.png'
    })
    repo.trash.moveManyToTrash([m.id])

    await trash.empty()

    expect(rm.mock.calls.every(([p]) => p.startsWith(`${ROOT}/`))).toBe(true)
    expect(repo.mockups.getMockup(m.id)).toBeUndefined()
  })
})

describe('deleteEntries', () => {
  it('deletes a trashed pile with its members for good', async () => {
    const { top, side } = trashedPile('pile')

    const result = await trash.deleteEntries([top.id])

    expect(result).toEqual({ deletedIds: [top.id, side.id].sort(), skippedIds: [] })
    expect(repo.mockups.getMockup(top.id)).toBeUndefined()
    expect(repo.mockups.getMockup(side.id)).toBeUndefined()
  })

  it('deletes the record even when the PSD is already gone', async () => {
    const m = make('gone')
    repo.trash.moveManyToTrash([m.id])
    rm.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))

    await expect(trash.deleteEntries([m.id])).resolves.toMatchObject({ deletedIds: [m.id] })
    expect(repo.mockups.getMockup(m.id)).toBeUndefined()
  })

  it('refuses anything that is not in Trash, so nothing skips it', async () => {
    const live = make('live')
    const result = await trash.deleteEntries([live.id, 9999])

    expect(result).toEqual({ deletedIds: [], skippedIds: [live.id, 9999] })
    expect(repo.mockups.getMockup(live.id)).toBeDefined()
    expect(rm).not.toHaveBeenCalled()
  })
})
