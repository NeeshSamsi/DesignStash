import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, sample } from '../db/repositories/__tests__/setup'
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

import { registerGroupingHandlers } from './grouping'

let sqlite: Database.Database
let repo: Repository
let push: ReturnType<typeof vi.fn>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  push = vi.fn()
  const ctx = {
    repo,
    push,
    telemetry: { get: () => ({ track: vi.fn() }) },
    settings: { getLibraryRoot: () => '/library' }
  } as unknown as HandlerContext
  registerGroupingHandlers(ctx)
})

afterEach(() => sqlite.close())

const make = (title: string) =>
  repo.mockups.createMockup({ ...sample, title, libraryPath: `/lib/${title}.psd` }).id

describe('stage changes from the older channels', () => {
  it('GROUPING_CONFIRM moves piles and singles to To stash', async () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(make) as [number, number, number, number]
    expect(repo.mockups.getMockup(a)?.stage).toBe('to_sort')

    const res = await call(IPC_CHANNELS.GROUPING_CONFIRM, {
      batchId: 'x',
      groups: [{ id: 'g1', memberIds: [a, b, c] }],
      singletonIds: [d]
    })

    expect(res).toMatchObject({ success: true })
    for (const id of [a, b, c, d]) expect(repo.mockups.getMockup(id)?.stage).toBe('to_stash')
    expect(repo.mockups.getMockup(a)?.sortedAt).toEqual(expect.any(String))
    expect(push).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, {
      toSort: 0,
      toStash: 2,
      sniffing: 0,
      trash: 0
    })
  })
})
