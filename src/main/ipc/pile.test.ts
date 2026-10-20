import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { IpcResult } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
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

import { registerPileHandlers } from './pile'
import { registerTrashHandlers } from './trash'
import { registerMockupHandlers } from './mockup'

let sqlite: Database.Database
let repo: Repository

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

const make = (title: string) =>
  repo.createMockup(approvedMockup({ title, libraryPath: `/lib/${title}.psd` })).id

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  const ctx = {
    repo,
    push: vi.fn(),
    ai: { activeProvider: async () => null },
    settings: { getLibraryRoot: () => '/library' }
  } as unknown as HandlerContext
  registerPileHandlers(ctx)
  registerTrashHandlers(ctx)
  registerMockupHandlers(ctx)
})

afterEach(() => sqlite.close())

describe('pile handlers', () => {
  it('creates a pile and returns its id and an undo snapshot', async () => {
    const [a, b] = [make('a'), make('b')]
    const res = await call<{ pileId: number; snapshot: { rows: unknown[] } }>(
      IPC_CHANNELS.PILE_CREATE,
      { memberIds: [a, b], topId: b }
    )
    expect(res).toMatchObject({ success: true, data: { pileId: b } })
    expect(res.success && res.data.snapshot.rows).toHaveLength(2)
    expect(repo.getMockup(a)?.groupId).toBe(b)
  })

  it('rejects a pile of one at the contract, before the repository runs', async () => {
    const a = make('a')
    const res = await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a], topId: a })
    expect(res).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('reports a refused action as an error result', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    const res = await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [b, c], topId: c })
    expect(res).toMatchObject({ success: false, error: { code: 'UNEXPECTED_ERROR' } })
  })

  it('adds, merges, puts on top and disbands, then restores from the snapshot', async () => {
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(make) as [
      number,
      number,
      number,
      number,
      number
    ]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [c, d], topId: c })

    expect(await call(IPC_CHANNELS.PILE_ADD, { pileId: a, memberIds: [e] })).toMatchObject({
      success: true,
      data: { pileId: a }
    })
    expect(await call(IPC_CHANNELS.PILE_MERGE, { sourceIds: [c], targetId: a })).toMatchObject({
      success: true,
      data: { pileId: a }
    })
    expect(await call(IPC_CHANNELS.PILE_SET_TOP, { pileId: a, topId: d })).toMatchObject({
      success: true,
      data: { pileId: d }
    })

    const disbanded = await call<{ snapshot: unknown; freedIds: number[] }>(
      IPC_CHANNELS.PILE_DISBAND,
      { pileId: d }
    )
    expect(disbanded.success && disbanded.data.freedIds.sort()).toEqual([a, b, c, d, e].sort())
    expect(repo.getLibrary({ sort: 'name' })).toHaveLength(5)

    const restored = await call<{ restoredIds: number[] }>(IPC_CHANNELS.PILE_RESTORE, {
      snapshot: disbanded.success && disbanded.data.snapshot
    })
    expect(restored.success && restored.data.restoredIds.sort()).toEqual([a, b, c, d, e].sort())
    expect(repo.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([d])
  })

  it('removes a mockup from a pile, validates the request, and restores from the snapshot', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')] as [number, number, number]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b, c], topId: a })

    expect(await call(IPC_CHANNELS.PILE_REMOVE, { pileId: a })).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })

    // The top leaves: the next mockup takes over.
    const removed = await call<{ pileId: number | null; snapshot: unknown; freedIds: number[] }>(
      IPC_CHANNELS.PILE_REMOVE,
      { pileId: a, mockupId: a }
    )
    expect(removed).toMatchObject({ success: true, data: { pileId: b, freedIds: [a] } })
    expect(repo.getMockup(b)).toMatchObject({ isGroup: true })
    expect(repo.getMockup(c)).toMatchObject({ groupId: b })

    const restored = await call<{ restoredIds: number[] }>(IPC_CHANNELS.PILE_RESTORE, {
      snapshot: removed.success && removed.data.snapshot
    })
    expect(restored.success && restored.data.restoredIds.sort()).toEqual([a, b, c].sort())
    expect(repo.getMockup(a)).toMatchObject({ isGroup: true, groupId: null })
    expect(repo.getMockup(c)).toMatchObject({ groupId: a })

    // A pile of two dissolves.
    await call(IPC_CHANNELS.PILE_DISBAND, { pileId: a })
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    expect(await call(IPC_CHANNELS.PILE_REMOVE, { pileId: a, mockupId: b })).toMatchObject({
      success: true,
      data: { pileId: null }
    })
    expect(repo.getMockup(a)).toMatchObject({ isGroup: false, groupId: null })
  })

  it('reports a mockup that is not in the pile as an error result', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')] as [number, number, number]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    expect(await call(IPC_CHANNELS.PILE_REMOVE, { pileId: a, mockupId: c })).toMatchObject({
      success: false
    })
  })
})

describe('trash handlers', () => {
  it('moves and restores several mockups at once', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')]

    expect(await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [a, b] })).toEqual({
      success: true,
      data: { ok: true, count: 2 }
    })
    expect(repo.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([c])

    expect(await call(IPC_CHANNELS.MOCKUP_RESTORE, { ids: [a, b] })).toEqual({
      success: true,
      data: { ok: true, count: 2 }
    })
    expect(repo.getLibrary({ sort: 'name' })).toHaveLength(3)
  })

  it('no longer takes the single mockupId form', async () => {
    const a = make('a')
    expect(await call(IPC_CHANNELS.MOCKUP_TRASH, { mockupId: a })).toMatchObject({ success: false })
    expect(await call(IPC_CHANNELS.MOCKUP_RESTORE, { mockupId: a })).toMatchObject({
      success: false
    })
  })

  it('rejects an empty id list', async () => {
    expect(await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [] })).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })
  })
})

describe('mockup detail', () => {
  it('lists a pile with its top first and marks it', async () => {
    const [a, b] = [make('front'), make('side')]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })

    const res = await call<{
      item: { id: number; pile: { memberCount: number } | null }
      variants: { id: number; isTop: boolean }[]
    }>(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: a })

    expect(res.success && res.data.item).toMatchObject({ id: a, pile: { memberCount: 2 } })
    expect(res.success && res.data.variants.map((v) => [v.id, v.isTop])).toEqual([
      [a, true],
      [b, false]
    ])
  })
})
