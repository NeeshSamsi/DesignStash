import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { IpcResult } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { SortBoard } from '@shared/grouping'
import type { Repository } from '../db/repository'
import { batchSample, createTestDb } from '../db/repositories/__tests__/setup'
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

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

const toSort = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      repo.createMockup({
        ...batchSample('b1'),
        title: `M${i}`,
        libraryPath: `/lib/${i}.psd`,
        stage: 'to_sort'
      }).id
  )

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  const ctx = {
    repo,
    push: vi.fn(),
    telemetry: { get: () => ({ track: vi.fn() }) }
  } as unknown as HandlerContext
  registerGroupingHandlers(ctx)
})

afterEach(() => sqlite.close())

describe('sort board handlers', () => {
  it('has no board before the first save', async () => {
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: 'b1' })).toEqual({
      success: true,
      data: { board: null }
    })
  })

  it('saves the board and loads it back (Finish later)', async () => {
    const [a, b, c] = toSort(3) as [number, number, number]
    const board: SortBoard = {
      batchId: 'b1',
      groups: [{ id: 'p', memberIds: [b, a] }],
      singletonIds: [c]
    }
    expect(await call(IPC_CHANNELS.SORT_BOARD_SAVE, board)).toEqual({
      success: true,
      data: { saved: true }
    })
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: 'b1' })).toEqual({
      success: true,
      data: { board }
    })
  })

  it('rejects a board with a pile of one at the contract', async () => {
    const [a] = toSort(1) as [number]
    const res = await call(IPC_CHANNELS.SORT_BOARD_SAVE, {
      batchId: 'b1',
      groups: [{ id: 'p', memberIds: [a] }],
      singletonIds: []
    })
    expect(res.success).toBe(false)
  })

  it('forgets the saved board once the piles are confirmed', async () => {
    const [a, b, c] = toSort(3) as [number, number, number]
    await call(IPC_CHANNELS.SORT_BOARD_SAVE, {
      batchId: 'b1',
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: [c]
    })
    await call(IPC_CHANNELS.GROUPING_CONFIRM, {
      batchId: 'b1',
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: [c]
    })
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: 'b1' })).toMatchObject({
      success: true,
      data: { board: null }
    })
  })
})

describe('grouping propose handler', () => {
  it('proposes only what is still waiting to be sorted (S1.E4)', async () => {
    const [a, b, c, d] = toSort(4) as [number, number, number, number]
    repo.setStage([c], 'to_stash')
    repo.updateMockup(d, { deletedAt: new Date().toISOString() })
    const res = await call<{ groups: unknown[]; singletons: { mockupId: number }[] }>(
      IPC_CHANNELS.GROUPING_PROPOSE,
      { batchId: 'b1' }
    )
    expect(res.success).toBe(true)
    if (!res.success) return
    const ids = [
      ...res.data.groups.flatMap((g) => (g as { members: { mockupId: number }[] }).members),
      ...res.data.singletons
    ]
      .map((m) => m.mockupId)
      .sort()
    expect(ids).toEqual([a, b].sort())
  })
})
