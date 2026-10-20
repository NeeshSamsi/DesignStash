import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { LibraryService } from '../library/library-service'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, fn) }
}))

import { registerTrashHandlers } from './trash'

let sqlite: Database.Database
let repo: Repository
let root: string
let push: ReturnType<typeof vi.fn>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  root = mkdtempSync(join(tmpdir(), 'ds-trash-'))
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  push = vi.fn()
  registerTrashHandlers({
    repo,
    push,
    settings: { getLibraryRoot: () => root },
    library: new LibraryService(repo, root)
  } as unknown as HandlerContext)
})

afterEach(() => {
  sqlite.close()
  rmSync(root, { recursive: true, force: true })
})

/** A mockup with a real 5-byte PSD in the stash folder. */
const make = (name: string) => {
  const dir = join(root, 'mockups', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'original.psd'), 'hello')
  writeFileSync(join(dir, 'cover.webp'), 'c')
  return repo.createMockup(
    approvedMockup({
      title: name,
      libraryPath: join(dir, 'original.psd'),
      coverPath: join(dir, 'cover.webp')
    })
  )
}

describe('trash channels', () => {
  it('lists, counts and sizes what is in Trash', async () => {
    const a = make('a')
    const b = make('b')
    repo.moveManyToTrash([a.id, b.id])

    const list = await call<{ items: { id: number; sizeBytes: number; trashedAt: string }[] }>(IPC_CHANNELS.TRASH_LIST)
    const stats = await call(IPC_CHANNELS.TRASH_STATS)

    expect(list.success && list.data.items).toHaveLength(2)
    expect(list.success && list.data.items[0]).toMatchObject({ sizeBytes: 5 })
    expect(stats).toEqual({ success: true, data: { count: 2, bytes: 10 } })
  })

  it('restores all, returns the ids, and an Undo moves them back', async () => {
    const a = make('a')
    const b = make('b')
    repo.moveManyToTrash([a.id, b.id])

    const res = await call<{ restoredIds: number[]; missing: number[] }>(IPC_CHANNELS.TRASH_RESTORE_ALL)

    expect(res.success && res.data.restoredIds.sort()).toEqual([a.id, b.id].sort())
    expect(repo.getTrash()).toHaveLength(0)
    expect(push).toHaveBeenCalledWith(
      IPC_CHANNELS.INBOX_COUNTS_CHANGED,
      expect.objectContaining({ trash: 0 })
    )

    const undo = await call(IPC_CHANNELS.MOCKUP_TRASH, {
      ids: res.success ? res.data.restoredIds : []
    })
    expect(undo).toMatchObject({ success: true, data: { count: 2 } })
    expect(repo.getTrash()).toHaveLength(2)
  })

  it('reports a restore whose PSD is gone as missing, with no path in the answer', async () => {
    const a = make('a')
    repo.moveManyToTrash([a.id])
    rmSync(a.libraryPath)

    const res = await call(IPC_CHANNELS.TRASH_RESTORE, { ids: [a.id] })

    expect(res).toEqual({ success: true, data: { restoredIds: [], missing: [a.id] } })
    expect(JSON.stringify(res)).not.toContain(root)
    expect(repo.getMockup(a.id)?.deletedAt).not.toBeNull()
  })

  it('deletes an entry whose PSD is gone', async () => {
    const a = make('a')
    repo.moveManyToTrash([a.id])
    rmSync(a.libraryPath)

    const res = await call(IPC_CHANNELS.TRASH_DELETE_ENTRY, { ids: [a.id] })

    expect(res).toEqual({ success: true, data: { deletedIds: [a.id], skippedIds: [] } })
    expect(repo.getMockup(a.id)).toBeUndefined()
  })

  it('empties Trash, removing the app copies and keeping My Stash', async () => {
    const gone = make('gone')
    const kept = make('kept')
    repo.moveManyToTrash([gone.id])

    const res = await call(IPC_CHANNELS.TRASH_EMPTY)

    expect(res).toEqual({ success: true, data: { deletedCount: 1, bytesFreed: 5 } })
    expect(existsSync(gone.libraryPath)).toBe(false)
    expect(existsSync(kept.libraryPath)).toBe(true)
    expect(repo.getMockup(kept.id)).toBeDefined()
    expect(push).toHaveBeenCalledWith(
      IPC_CHANNELS.INBOX_COUNTS_CHANGED,
      expect.objectContaining({ trash: 0 })
    )
  })

  it('rejects empty id lists at the contract', async () => {
    expect(await call(IPC_CHANNELS.TRASH_RESTORE, { ids: [] })).toMatchObject({ success: false })
    expect(await call(IPC_CHANNELS.TRASH_DELETE_ENTRY, { ids: [] })).toMatchObject({ success: false })
  })

  it('moving to Trash and back pushes the counts', async () => {
    const a = make('a')
    await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [a.id] })
    expect(push).toHaveBeenLastCalledWith(
      IPC_CHANNELS.INBOX_COUNTS_CHANGED,
      expect.objectContaining({ trash: 1 })
    )
  })
})
