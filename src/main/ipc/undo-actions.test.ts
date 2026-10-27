import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { LibraryService } from '../library/library-service'
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
  },
  shell: { openPath: vi.fn() }
}))

import { registerMockupHandlers } from './mockup'
import { registerPileHandlers } from './pile'
import { registerTrashHandlers } from './trash'

let root: string
let sqlite: Database.Database
let repo: Repository
let undo: UndoService

/** Calls a channel and returns its data, failing the test on an error reply. */
const call = async <T = Record<string, unknown>>(channel: string, args?: unknown): Promise<T> => {
  const res = (await handlers.get(channel)!(null, args)) as IpcResult<T>
  if (!res.success) throw new Error(`${channel}: ${res.error.message}`)
  return res.data
}

const make = (title: string): number =>
  repo.mockups.createMockup(
    approvedMockup({ title, libraryPath: `${root}/mockups/${title}/original.psd` })
  ).id

/** The rows a test cares about, as they are now. */
const rows = (ids: number[]) =>
  ids.map((id) => {
    const m = repo.mockups.getMockup(id)
    return (
      m && {
        id,
        favourite: m.favourite,
        groupId: m.groupId,
        isGroup: m.isGroup,
        deletedAt: m.deletedAt
      }
    )
  })

beforeEach(() => {
  handlers.clear()
  root = mkdtempSync(join(tmpdir(), 'ds-undo-actions-'))
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  const undoing = undoForTests(repo, test.db)
  undo = undoing.undo
  let settings = { activeModelId: null, aiRunTimes: {}, ignoredDrift: [] as string[] }
  const ctx = {
    repo,
    push: vi.fn(),
    ai: { activeProvider: async () => null },
    telemetry: { get: () => ({ track: vi.fn() }), rebuild: vi.fn() },
    settings: {
      getLibraryRoot: () => root,
      get: () => settings,
      update: (patch: object) => (settings = { ...settings, ...patch })
    },
    library: new LibraryService(repo, root),
    ...undoing
  } as unknown as HandlerContext
  // The cover work as the cover service's own tests fake it: no image tools, no files.
  let coverId = 0
  registerMockupHandlers(ctx, {
    stat: async () => ({ size: 1024 }),
    readHead: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    probe: async () => ({ width: 1600, height: 1200 }),
    makeCover: async (_src, outDir) => `${outDir}/cover.webp`,
    makeCoverFromRaw: async (_raw, outDir) => `${outDir}/cover.webp`,
    readEmbedded: async () => ({ data: Buffer.alloc(4), width: 800, height: 600 }),
    isPlaceholder: async () => false,
    newId: () => `c${++coverId}`
  })
  registerPileHandlers(ctx)
  registerTrashHandlers(ctx)
})

afterEach(() => {
  sqlite.close()
  rmSync(root, { recursive: true, force: true })
})

/** Does, undoes and redoes the newest entry, checking the rows come back to each state exactly. */
async function roundTrip(ids: number[], before: ReturnType<typeof rows>, label: string) {
  const after = rows(ids)
  expect(undo.history.state().undo).toMatchObject({ label })
  expect(await undo.history.undo()).toEqual({ status: 'done', label })
  expect(rows(ids)).toEqual(before)
  expect(await undo.history.redo()).toEqual({ status: 'done', label })
  expect(rows(ids)).toEqual(after)
}

describe('one action, one entry', () => {
  it('stars several mockups as one entry, and its undo unstars them all', async () => {
    const ids = [make('a'), make('b'), make('c')]
    const before = rows(ids)

    const reply = await call(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { ids, favourite: true })

    expect(reply).toEqual({ favourite: true, undoEntryId: expect.any(Number) })
    expect(rows(ids).every((r) => r?.favourite)).toBe(true)
    expect(undo.history.state().entries).toHaveLength(1)
    await roundTrip(ids, before, 'Star')
  })

  it('names an unstar as such', async () => {
    const a = make('a')
    repo.mockups.setFavourite(a, true)
    await call(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { ids: [a], favourite: false })
    expect(undo.history.state().undo).toMatchObject({ label: 'Unstar' })
  })

  it('disbands several piles as one entry, and its undo puts every pile back', async () => {
    const [a, b, c, d] = [make('a'), make('b'), make('c'), make('d')]
    repo.piles.createPile([a, b], a)
    repo.piles.createPile([c, d], c)
    const ids = [a, b, c, d]
    const before = rows(ids)

    const reply = await call<{ freedIds: number[]; undoEntryId: number }>(
      IPC_CHANNELS.PILE_DISBAND,
      {
        pileIds: [a, c]
      }
    )

    expect(reply.freedIds.sort()).toEqual(ids.sort())
    expect(reply.undoEntryId).toEqual(expect.any(Number))
    expect(rows(ids).every((r) => r?.groupId === null && !r.isGroup)).toBe(true)
    await roundTrip(ids, before, 'Disband piles')
  })

  it('names a single disband as such, and changes nothing when one id is not a pile', async () => {
    const [a, b, c] = [make('a'), make('b'), make('c')]
    repo.piles.createPile([a, b], a)
    const before = rows([a, b, c])

    const res = (await handlers.get(IPC_CHANNELS.PILE_DISBAND)!(null, {
      pileIds: [a, c]
    })) as IpcResult<unknown>
    expect(res.success).toBe(false)
    expect(rows([a, b, c])).toEqual(before)

    await call(IPC_CHANNELS.PILE_DISBAND, { pileIds: [a] })
    expect(undo.history.state().undo).toMatchObject({ label: 'Disband pile' })
  })

  it('trashing a pile member takes it out of its pile in the same entry, and undo puts it back in', async () => {
    const [top, member, other] = [make('top'), make('member'), make('other')]
    repo.piles.createPile([top, member, other], top)
    const ids = [top, member, other]
    const before = rows(ids)

    const reply = await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [member] })

    expect(reply).toEqual({ ok: true, count: 1, undoEntryId: expect.any(Number) })
    expect(repo.mockups.getMockup(member)).toMatchObject({ groupId: null })
    expect(repo.mockups.getMockup(member)?.deletedAt).not.toBeNull()
    await roundTrip(ids, before, 'Move to Trash')
  })
})

/** Whole rows and their tags: undo and redo must bring them back exactly. */
const full = (ids: number[]) =>
  ids.map((id) => ({
    row: repo.mockups.getMockup(id) ?? null,
    tags: repo.mockups.getTagsForMockup(id).map((t) => t.id)
  }))

/** Runs a recorded action, then checks its undo and redo against the rows before and after it. */
async function recorded(label: string, ids: number[], act: () => Promise<Record<string, unknown>>) {
  const before = full(ids)
  const reply = await act()
  expect(reply.undoEntryId).toEqual(expect.any(Number))
  const after = full(ids)
  expect(after).not.toEqual(before)
  expect(undo.history.state().undo).toMatchObject({ label })
  expect(await undo.history.undo()).toEqual({ status: 'done', label })
  expect(full(ids)).toEqual(before)
  expect(await undo.history.redo()).toEqual({ status: 'done', label })
  expect(full(ids)).toEqual(after)
}

describe('recorded actions', () => {
  it('Restore and Restore all', async () => {
    const [a, b] = [make('a'), make('b')]
    // Restore keeps a mockup in Trash when its PSD is gone, so these have theirs.
    for (const id of [a, b]) {
      const psd = repo.mockups.getMockup(id)!.libraryPath
      mkdirSync(dirname(psd), { recursive: true })
      writeFileSync(psd, 'psd')
    }
    repo.trash.moveManyToTrash([a, b])
    await recorded('Restore', [a, b], () => call(IPC_CHANNELS.TRASH_RESTORE, { ids: [a] }))
    await recorded('Restore all', [a, b], () => call(IPC_CHANNELS.TRASH_RESTORE_ALL))
  })

  it('New pile, Add to pile, Merge piles, Put on top, Remove from pile', async () => {
    const [a, b, c, d, e] = [make('a'), make('b'), make('c'), make('d'), make('e')]
    const all = [a, b, c, d, e]
    await recorded('New pile', all, () =>
      call(IPC_CHANNELS.PILE_CREATE, { memberIds: [a, b], topId: a })
    )
    await recorded('Add to pile', all, () =>
      call(IPC_CHANNELS.PILE_ADD, { pileId: a, memberIds: [c] })
    )
    repo.piles.createPile([d, e], d)
    await recorded('Merge piles', all, () =>
      call(IPC_CHANNELS.PILE_MERGE, { sourceIds: [d], targetId: a })
    )
    await recorded('Put on top', all, () =>
      call(IPC_CHANNELS.PILE_SET_TOP, { pileId: a, topId: b })
    )
    await recorded('Remove from pile', all, () =>
      call(IPC_CHANNELS.PILE_REMOVE, { pileId: b, mockupId: c })
    )
  })

  it('Rename pile and Edit variation', async () => {
    const [a, b] = [make('a'), make('b')]
    repo.piles.createPile([a, b], a)
    await recorded('Rename pile', [a, b], () =>
      call(IPC_CHANNELS.PILE_RENAME, { pileId: a, base: 'Canvas tote' })
    )
    await recorded('Edit variation', [a, b], () =>
      call(IPC_CHANNELS.PILE_SET_VARIATION, { mockupId: b, words: 'Back' })
    )
  })

  it('Replace cover and Use the PSD’s preview', async () => {
    const a = make('a')
    await recorded('Replace cover', [a], () =>
      call(IPC_CHANNELS.MOCKUP_SET_COVER, { mockupId: a, filePath: '/Users/me/Desktop/new.png' })
    )
    await recorded('Use the PSD’s preview', [a], () =>
      call(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: a })
    )
  })

  it('Edit details, field by field', async () => {
    const a = make('a')
    await recorded('Edit details', [a], () =>
      call(IPC_CHANNELS.MOCKUP_UPDATE, {
        mockupId: a,
        title: 'Tote bag',
        description: 'Canvas, front',
        tagIds: []
      })
    )
    // A description the AI wrote since is kept when the title edit is undone.
    await call(IPC_CHANNELS.MOCKUP_UPDATE, {
      mockupId: a,
      title: 'Mug',
      description: 'Canvas, front',
      tagIds: []
    })
    repo.mockups.updateMockup(a, { description: 'Written later' })
    await undo.history.undo()
    expect(repo.mockups.getMockup(a)).toMatchObject({
      title: 'Tote bag',
      description: 'Written later'
    })
  })
})

describe('permanent deletes', () => {
  it('Empty Trash drops every entry that points at what it deleted, and ⌘Z walks back past them', async () => {
    const [a, b] = [make('a'), make('b')]
    await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [a] })
    await call(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { ids: [b], favourite: true })

    await call(IPC_CHANNELS.TRASH_EMPTY)

    expect(undo.history.state().entries).toHaveLength(1)
    expect(await undo.history.undo()).toEqual({ status: 'done', label: 'Star' })
    expect(await undo.history.undo()).toEqual({ status: 'empty' })
  })

  it('Delete for good drops only the entries that point at that mockup', async () => {
    const [a, b] = [make('a'), make('b')]
    await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [a] })
    const kept = (await call<{ undoEntryId: number }>(IPC_CHANNELS.MOCKUP_TRASH, { ids: [b] }))
      .undoEntryId

    await call(IPC_CHANNELS.TRASH_DELETE_ENTRY, { ids: [a] })

    expect(undo.history.state().entries).toEqual([{ id: kept }])
  })
})
