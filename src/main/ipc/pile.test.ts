import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { IpcResult } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
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

import { registerPileHandlers } from './pile'
import { registerTrashHandlers } from './trash'
import { registerMockupHandlers } from './mockup'

let sqlite: Database.Database
let repo: Repository
let undo: UndoService

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

const make = (title: string) =>
  repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/${title}.psd` })).id

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  const undoing = undoForTests(repo, test.db)
  undo = undoing.undo
  const ctx = {
    repo,
    push: vi.fn(),
    ai: { activeProvider: async () => null },
    settings: { getLibraryRoot: () => '/library' },
    ...undoing
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
    expect(repo.mockups.getMockup(a)?.groupId).toBe(b)
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

  it('adds, merges, puts on top and disbands, then the disband is undone', async () => {
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
      { pileIds: [d] }
    )
    expect(disbanded.success && disbanded.data.freedIds.sort()).toEqual([a, b, c, d, e].sort())
    expect(repo.library.getLibrary({ sort: 'name' })).toHaveLength(5)

    // The disband's own history entry puts the pile back.
    await undo.history.undo()
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([d])
  })

  it('removes a mockup from a pile, validates the request, and its undo puts it back', async () => {
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
    expect(repo.mockups.getMockup(b)).toMatchObject({ isGroup: true })
    expect(repo.mockups.getMockup(c)).toMatchObject({ groupId: b })

    await undo.history.undo()
    expect(repo.mockups.getMockup(a)).toMatchObject({ isGroup: true, groupId: null })
    expect(repo.mockups.getMockup(c)).toMatchObject({ groupId: a })

    // A pile of two dissolves.
    await call(IPC_CHANNELS.PILE_DISBAND, { pileIds: [a] })
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    expect(await call(IPC_CHANNELS.PILE_REMOVE, { pileId: a, mockupId: b })).toMatchObject({
      success: true,
      data: { pileId: null }
    })
    expect(repo.mockups.getMockup(a)).toMatchObject({ isGroup: false, groupId: null })
  })

  it('reports a mockup that is not in the pile as an error result', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')] as [number, number, number]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    expect(await call(IPC_CHANNELS.PILE_REMOVE, { pileId: a, mockupId: c })).toMatchObject({
      success: false
    })
  })
})

describe('pile members (the pile page, F-068)', () => {
  it('answers a pile’s mockups as library rows in one call: the top first, then the rest in order', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')] as [number, number, number]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b, c], topId: c })
    const tag = repo.tags.createTag({
      label: 'Clay',
      categoryId: repo.tags.createCategory({ label: 'Style' }).id
    })
    repo.mockups.addTagToMockup(b, tag.id)

    const res = await call<{
      items: { id: number; pileId: number; pile: unknown; tags: { label: string }[] }[]
    }>(IPC_CHANNELS.PILE_MEMBERS, { pileId: c })

    expect(res.success).toBe(true)
    const items = res.success ? res.data.items : []
    expect(items.map((i) => i.id)).toEqual([c, a, b])
    expect(items[0]).toMatchObject({ pileId: c, pile: { memberCount: 3 } })
    expect(items.find((i) => i.id === b)?.tags.map((t) => t.label)).toEqual(['Clay'])
  })

  it('answers no mockups for a pile that is gone or a mockup on its own', async () => {
    const [a, b] = [make('a'), make('b')] as [number, number]
    expect(await call(IPC_CHANNELS.PILE_MEMBERS, { pileId: a })).toEqual({
      success: true,
      data: { items: [] }
    })
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    repo.trash.moveManyToTrash([a])
    expect(await call(IPC_CHANNELS.PILE_MEMBERS, { pileId: a })).toEqual({
      success: true,
      data: { items: [] }
    })
  })
})

describe('trash handlers', () => {
  it('moves and restores several mockups at once', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')]

    expect(await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [a, b] })).toEqual({
      success: true,
      data: { ok: true, count: 2, undoEntryId: expect.any(Number) }
    })
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([c])

    expect(await call(IPC_CHANNELS.MOCKUP_RESTORE, { ids: [a, b] })).toEqual({
      success: true,
      data: { ok: true, count: 2, undoEntryId: expect.any(Number) }
    })
    expect(repo.library.getLibrary({ sort: 'name' })).toHaveLength(3)
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

describe('pile titles: rename and set-variation (design/specs/pile-titles.md)', () => {
  /** A stashed mockup that came in as `fileName`. */
  const file = (fileName: string, extra = {}) =>
    repo.mockups.createMockup(
      approvedMockup({
        title: fileName.replace(/\.psd$/, ''),
        libraryPath: `/lib/${fileName}`,
        importContext: { batchId: 'b', folderTrail: [], originalFilename: fileName },
        ...extra
      })
    ).id
  const titles = (ids: number[]) =>
    ids.map((id) => [repo.mockups.getMockup(id)!.title, repo.mockups.getMockup(id)!.variation])

  async function stashedPile() {
    const [a, b] = [file('tote-a.psd'), file('tote-b.psd')]
    await call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    return [a, b] as const
  }

  it('renames a pile in My Stash: every mockup, exactly, with what it was for Undo', async () => {
    const [a, b] = await stashedPile()
    const res = await call(IPC_CHANNELS.PILE_RENAME, { pileId: a, base: 'Canvas tote' })
    expect(res).toEqual({
      success: true,
      data: {
        pileId: a,
        base: 'Canvas tote',
        previous: 'tote-a',
        mockupIds: [a, b],
        undoEntryId: expect.any(Number)
      }
    })
    expect(titles([a, b])).toEqual([
      ['Canvas tote', 'A'],
      ['Canvas tote', 'B']
    ])
    expect(repo.library.getLibrary({ sort: 'date', query: 'canvas' }).map((r) => r.id)).toEqual([a])
  })

  it('refuses a blank name at the contract', async () => {
    const [a] = await stashedPile()
    expect(await call(IPC_CHANNELS.PILE_RENAME, { pileId: a, base: '   ' })).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })
  })

  it('renames a pile waiting in To stash on its drafts, making them first', async () => {
    const [a, b] = [
      file('tote-a.psd', { stage: 'to_stash' }),
      file('tote-b.psd', { stage: 'to_stash' })
    ]
    repo.piles.createPile([a, b], a)

    await call(IPC_CHANNELS.PILE_RENAME, { pileId: a, base: 'Canvas tote' })

    expect([repo.drafts.getDraft(a)?.title, repo.drafts.getDraft(b)?.title]).toEqual([
      'Canvas tote',
      'Canvas tote'
    ])
    expect(repo.drafts.getDraft(b)?.variation).toBe('B')
    expect(repo.mockups.getMockup(b)?.title).toBe('tote-b')
  })

  it('sets a variation as typed, and an emptied one takes its marker back', async () => {
    const [, b] = await stashedPile()
    expect(
      await call(IPC_CHANNELS.PILE_SET_VARIATION, { mockupId: b, words: 'on a hook' })
    ).toEqual({
      success: true,
      data: {
        mockupId: b,
        variation: { words: 'on a hook', source: 'typed' },
        previous: { words: 'B', source: 'marker' },
        undoEntryId: expect.any(Number)
      }
    })
    const emptied = await call<{ variation: unknown }>(IPC_CHANNELS.PILE_SET_VARIATION, {
      mockupId: b,
      words: ''
    })
    expect(emptied.success && emptied.data.variation).toEqual({ words: 'B', source: 'marker' })
  })

  it('saves a pile mockup’s details: a new title renames the pile, and the variation is its own', async () => {
    const [a, b] = await stashedPile()
    const res = await call(IPC_CHANNELS.MOCKUP_UPDATE, {
      mockupId: b,
      title: 'Canvas tote',
      description: 'On a hook',
      tagIds: [],
      variation: 'hanging'
    })
    expect(res).toMatchObject({ success: true })
    expect(titles([a, b])).toEqual([
      ['Canvas tote', 'A'],
      ['Canvas tote', 'hanging']
    ])
    expect(repo.mockups.getMockup(b)?.description).toBe('On a hook')
  })

  it('sends the pile and the variation with a mockup’s details', async () => {
    const [a, b] = await stashedPile()
    const res = await call<{
      item: { pileId: number; variation: unknown }
      variants: { variation: unknown }[]
    }>(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: b })
    expect(res.success && res.data.item).toMatchObject({
      title: 'tote-a',
      pileId: a,
      variation: { words: 'B', source: 'marker' }
    })
  })
})
