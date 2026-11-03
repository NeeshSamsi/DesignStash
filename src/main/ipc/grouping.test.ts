import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { IpcResult } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import { TO_SORT_BOARD, type SortBoard } from '@shared/grouping'
import type { Repository } from '../db/repository'
import { batchSample, createTestDb } from '../db/repositories/__tests__/setup'
import { undoForTests } from '../undo/test-support'
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

const toSort = (n: number, batch = 'b1') =>
  Array.from(
    { length: n },
    (_, i) =>
      repo.mockups.createMockup({
        ...batchSample(batch),
        title: `M${i}`,
        libraryPath: `/lib/${batch}/${i}.psd`,
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
    telemetry: { get: () => ({ track: vi.fn() }) },
    ...undoForTests(repo, test.db)
  } as unknown as HandlerContext
  registerGroupingHandlers(ctx)
})

afterEach(() => sqlite.close())

describe('sort board handlers', () => {
  it('has no board before the first save', async () => {
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: TO_SORT_BOARD })).toEqual({
      success: true,
      data: { board: null }
    })
  })

  it('saves the board and loads it back (Finish later)', async () => {
    const [a, b, c] = toSort(3) as [number, number, number]
    const board: SortBoard = {
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [b, a] }],
      singletonIds: [c]
    }
    expect(await call(IPC_CHANNELS.SORT_BOARD_SAVE, board)).toEqual({
      success: true,
      data: { saved: true }
    })
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: TO_SORT_BOARD })).toEqual({
      success: true,
      data: { board }
    })
  })

  it('rejects a board with a pile of one at the contract', async () => {
    const [a] = toSort(1) as [number]
    const res = await call(IPC_CHANNELS.SORT_BOARD_SAVE, {
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a] }],
      singletonIds: []
    })
    expect(res.success).toBe(false)
  })

  it('forgets the saved board once the piles are confirmed', async () => {
    const [a, b, c] = toSort(3) as [number, number, number]
    await call(IPC_CHANNELS.SORT_BOARD_SAVE, {
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: [c]
    })
    await call(IPC_CHANNELS.GROUPING_CONFIRM, {
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: [c]
    })
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: TO_SORT_BOARD })).toMatchObject({
      success: true,
      data: { board: null }
    })
  })
})

describe('one board for everything in To sort (F-049)', () => {
  const proposed = async () => {
    const res = await call<{
      groups: { members: { mockupId: number }[] }[]
      singletons: { mockupId: number }[]
    }>(IPC_CHANNELS.GROUPING_PROPOSE, { batchId: TO_SORT_BOARD })
    if (!res.success) throw new Error('propose failed')
    return [...res.data.groups.flatMap((g) => g.members), ...res.data.singletons]
      .map((m) => m.mockupId)
      .sort((a, b) => a - b)
  }

  it('proposes from every haul waiting, not just one', async () => {
    const first = toSort(2, 'b1')
    const second = toSort(3, 'b2')
    expect(await proposed()).toEqual([...first, ...second])
  })

  it('confirming some leaves the rest of the saved board as it was', async () => {
    const [a, b] = toSort(2, 'b1') as [number, number]
    const [x, y] = toSort(2, 'b2') as [number, number]
    await call(IPC_CHANNELS.SORT_BOARD_SAVE, {
      batchId: TO_SORT_BOARD,
      groups: [
        { id: 'p', memberIds: [a, b] },
        { id: 'q', memberIds: [x, y] }
      ],
      singletonIds: []
    })
    await call(IPC_CHANNELS.GROUPING_CONFIRM, {
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: []
    })
    expect(repo.mockups.getMockup(a)).toMatchObject({ isGroup: true, stage: 'to_stash' })
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: TO_SORT_BOARD })).toEqual({
      success: true,
      data: {
        board: {
          batchId: TO_SORT_BOARD,
          groups: [{ id: 'q', memberIds: [x, y] }],
          singletonIds: []
        }
      }
    })
  })
})

describe('grouping confirm handler', () => {
  it('changes nothing when one of its writes fails part-way', async () => {
    const [a, b, c] = toSort(3) as [number, number, number]
    const board = {
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: [c]
    }
    await call(IPC_CHANNELS.SORT_BOARD_SAVE, board)
    vi.spyOn(repo.mockups, 'setStage').mockImplementation(() => {
      throw new Error('disk full')
    })
    const res = await call(IPC_CHANNELS.GROUPING_CONFIRM, board)
    expect(res.success).toBe(false)
    expect(repo.mockups.getMockup(a)).toMatchObject({
      isGroup: false,
      groupId: null,
      stage: 'to_sort'
    })
    expect(repo.mockups.getMockup(b)).toMatchObject({ groupId: null, stage: 'to_sort' })
    expect(await call(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: TO_SORT_BOARD })).toEqual({
      success: true,
      data: { board }
    })
  })
})

describe('grouping propose handler', () => {
  it('proposes only what is still waiting to be sorted (S1.E4)', async () => {
    const [a, b, c, d] = toSort(4) as [number, number, number, number]
    repo.mockups.setStage([c], 'to_stash')
    repo.mockups.updateMockup(d, { deletedAt: new Date().toISOString() })
    const res = await call<{ groups: unknown[]; singletons: { mockupId: number }[] }>(
      IPC_CHANNELS.GROUPING_PROPOSE,
      { batchId: TO_SORT_BOARD }
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

  describe('grouping propose handler: zips', () => {
    it('passes on which zip each mockup came from', async () => {
      const fromZip = (fileName: string, folderTrail: string[]) =>
        repo.mockups.createMockup({
          ...batchSample('b1'),
          title: fileName,
          libraryPath: `/lib/${fileName}`,
          stage: 'to_sort',
          importContext: {
            batchId: TO_SORT_BOARD,
            folderTrail,
            originalFilename: fileName,
            archiveName: 'Apple-Watch-Ultra-Mockup.zip',
            archiveTitle: 'Apple Watch Ultra Mockup'
          }
        }).id
      const a = fromZip('Apple Watch Ultra - Realistic, PSD.psd', [
        'Apple Watch Ultra Mockup',
        'Realistic'
      ])
      const b = fromZip('Apple Watch Ultra - Сlay, PSD.psd', [
        'Apple Watch Ultra Mockup',
        'Clay Version'
      ])

      const res = await call<{
        groups: { reason: string; members: { mockupId: number; archiveTitle?: string }[] }[]
      }>(IPC_CHANNELS.GROUPING_PROPOSE, { batchId: TO_SORT_BOARD })
      expect(res.success).toBe(true)
      if (!res.success) return
      expect(res.data.groups).toHaveLength(1)
      expect(res.data.groups[0]).toMatchObject({ reason: 'archive' })
      expect(res.data.groups[0]!.members.map((m) => m.mockupId).sort()).toEqual([a, b].sort())
      expect(res.data.groups[0]!.members[0]).toMatchObject({
        archiveTitle: 'Apple Watch Ultra Mockup'
      })
    })
  })
})
