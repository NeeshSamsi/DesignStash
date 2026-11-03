import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, PUSH_CHANNELS, PUSH_CONTRACT, type IpcResult } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, sample } from '../db/repositories/__tests__/setup'
import { undoForTests } from '../undo/test-support'
import type { UndoService } from '../undo/undo-service'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { registerInboxHandlers } from './inbox'

let sqlite: Database.Database
let repo: Repository
let push: ReturnType<typeof vi.fn>
let undo: UndoService

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  push = vi.fn()
  const undoing = undoForTests(repo, test.db)
  undo = undoing.undo
  registerInboxHandlers({
    repo,
    push,
    ai: { activeProvider: async () => null },
    settings: { getLibraryRoot: () => '/library' },
    ...undoing
  } as unknown as HandlerContext)
})

afterEach(() => sqlite.close())

const make = (title: string) =>
  repo.mockups.createMockup({
    ...sample,
    title,
    libraryPath: `/library/mockups/${title}/original.psd`
  }).id

describe('inbox channels', () => {
  it('lists a stage and counts both', async () => {
    const [a, b] = [make('a'), make('b')]
    repo.mockups.setStage([b], 'to_stash')

    const toSort = await call<{ items: { id: number }[] }>(IPC_CHANNELS.INBOX_LIST, {
      stage: 'to_sort'
    })
    const toStash = await call<{ items: { id: number }[] }>(IPC_CHANNELS.INBOX_LIST, {
      stage: 'to_stash'
    })

    expect(toSort.success && toSort.data.items.map((i) => i.id)).toEqual([a])
    expect(toStash.success && toStash.data.items.map((i) => i.id)).toEqual([b])
    expect(await call(IPC_CHANNELS.INBOX_COUNTS)).toEqual({
      success: true,
      data: { toSort: 1, toStash: 1, sniffing: 0, trash: 0 }
    })
  })

  it('rejects a stage that is not an inbox', async () => {
    expect(await call(IPC_CHANNELS.INBOX_LIST, { stage: 'stashed' })).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })
  })

  it('tosses mockups and pushes the new counts', async () => {
    const [a, b] = [make('a'), make('b')]

    const res = await call(IPC_CHANNELS.INBOX_TOSS, { ids: [a] })

    expect(res).toEqual({
      success: true,
      data: { tossedIds: [a], skippedIds: [], undoEntryId: expect.any(Number) }
    })
    // Toss goes to Trash, marked with the inbox it came from (design/specs/undo.md).
    expect(repo.mockups.getMockup(a)).toMatchObject({ trashOrigin: 'to-sort' })
    expect(repo.mockups.getMockup(a)?.deletedAt).not.toBeNull()
    expect(repo.mockups.getMockup(b)?.deletedAt).toBeNull()
    expect(push).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, {
      toSort: 1,
      toStash: 0,
      sniffing: 0,
      trash: 1
    })
  })

  it('a toss is one entry in the history: its undo puts the mockups back in their inbox, and redo tosses again', async () => {
    const [a, b] = [make('a'), make('b')]
    const res = await call<{ undoEntryId: number }>(IPC_CHANNELS.INBOX_TOSS, { ids: [a, b] })
    expect(undo.history.state().undo).toMatchObject({ label: 'Toss' })

    expect(await undo.history.undoEntry(res.success ? res.data.undoEntryId : -1)).toMatchObject({
      status: 'done'
    })
    for (const id of [a, b]) {
      expect(repo.mockups.getMockup(id)).toMatchObject({ deletedAt: null, stage: 'to_sort' })
    }
    await undo.history.redo()
    for (const id of [a, b]) expect(repo.mockups.getMockup(id)?.deletedAt).not.toBeNull()
  })

  it('rejects an empty toss', async () => {
    expect(await call(IPC_CHANNELS.INBOX_TOSS, { ids: [] })).toMatchObject({ success: false })
  })
})

describe('inbox:counts push', () => {
  it('is a push channel whose payload is the counts', () => {
    expect(PUSH_CHANNELS).toContain(IPC_CHANNELS.INBOX_COUNTS_CHANGED)
    const { payload } = PUSH_CONTRACT[IPC_CHANNELS.INBOX_COUNTS_CHANGED]
    expect(payload.safeParse({ toSort: 1, toStash: 2, sniffing: 0, trash: 3 }).success).toBe(true)
    expect(payload.safeParse({ toSort: 1 }).success).toBe(false)
  })
})
