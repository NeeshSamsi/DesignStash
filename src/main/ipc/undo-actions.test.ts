import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  registerMockupHandlers(ctx)
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
