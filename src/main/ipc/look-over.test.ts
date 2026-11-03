import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { LookOverItem, LookOverQueue } from '@shared/approval'
import type { InferenceProvider } from '@shared/inference'
import type { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, sample } from '../db/repositories/__tests__/setup'
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

import { registerApprovalHandlers } from './approval'
import { inferenceQueueFor } from './library-effects'

let sqlite: Database.Database
let repo: Repository
let push: ReturnType<typeof vi.fn>
let ctx: HandlerContext
let provider: InferenceProvider | null

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  seedTaxonomy(test.db)
  ensureSearchIndex(test.db)
  push = vi.fn()
  provider = null
  let settings = { activeModelId: null, aiRunTimes: {} }
  ctx = {
    repo,
    push,
    ai: { activeProvider: async () => provider },
    telemetry: { get: () => ({ track: vi.fn() }) },
    settings: {
      getLibraryRoot: () => '/library',
      get: () => settings,
      update: (patch: object) => (settings = { ...settings, ...patch })
    },
    ...undoForTests(repo, test.db)
  } as unknown as HandlerContext
  registerApprovalHandlers(ctx)
})

afterEach(() => sqlite.close())

const waiting = (name: string) => {
  const m = repo.mockups.createMockup({
    ...sample,
    title: name,
    libraryPath: `/lib/${name}.psd`,
    coverPath: `/lib/${name}.webp`
  })
  repo.mockups.setStage([m.id], 'to_stash')
  return m
}

describe('look-over channels', () => {
  it('opens the queue, saves a draft, skips and remembers a resume point', async () => {
    const [a, b] = [waiting('a'), waiting('b')]

    const opened = await call<LookOverQueue>(IPC_CHANNELS.LOOK_OVER_OPEN)
    expect(opened.success && opened.data.units.map((u) => u.unitId)).toEqual([a.id, b.id])

    expect(
      await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
        mockupId: a.id,
        title: 'A!',
        description: '',
        tagIds: []
      })
    ).toEqual({ success: true, data: { propagatedIds: [] } })

    expect(await call(IPC_CHANNELS.LOOK_OVER_SKIP, { mockupId: a.id })).toEqual({
      success: true,
      data: { skipped: true }
    })
    expect(await call(IPC_CHANNELS.LOOK_OVER_SET_RESUME, { unitId: b.id, mockupId: b.id })).toEqual(
      {
        success: true,
        data: { saved: true }
      }
    )

    const again = await call<LookOverQueue>(IPC_CHANNELS.LOOK_OVER_OPEN)
    expect(again.success && again.data.units.map((u) => u.unitId)).toEqual([b.id, a.id])
    expect(again.success && again.data.resume).toEqual({ unitId: b.id, mockupId: b.id })
    expect(again.success && again.data.units[1]!.items[0]!.title).toBe('A!')
  })

  it('rejects an empty title at the contract', async () => {
    const a = waiting('a')
    expect(
      await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
        mockupId: a.id,
        title: '',
        description: '',
        tagIds: []
      })
    ).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('pushes every other mockup a save reached as it answers, so the window never reopens the queue', async () => {
    const [top, side] = [waiting('top'), waiting('side')]
    repo.piles.createPile([top.id, side.id], top.id)
    await call(IPC_CHANNELS.LOOK_OVER_OPEN)
    push.mockClear()

    const saved = await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
      mockupId: top.id,
      title: 'Renamed',
      description: '',
      tagIds: []
    })
    expect(saved).toEqual({ success: true, data: { propagatedIds: [side.id] } })
    expect(push).toHaveBeenCalledWith(
      IPC_CHANNELS.LOOK_OVER_DRAFT,
      expect.objectContaining({ mockupId: side.id, title: 'Renamed' })
    )
    expect(push).not.toHaveBeenCalledWith(
      IPC_CHANNELS.LOOK_OVER_DRAFT,
      expect.objectContaining({ mockupId: top.id })
    )
  })

  it("saves an edit on the top of a pile, offers it on the variant, and pushes the variant once accepting's version is ready", async () => {
    const [top, side] = [waiting('top'), waiting('side')]
    repo.piles.createPile([top.id, side.id], top.id)
    await call(IPC_CHANNELS.LOOK_OVER_OPEN)

    const saved = await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
      mockupId: top.id,
      title: 'Top',
      description: 'Shared',
      tagIds: []
    })
    expect(saved).toEqual({ success: true, data: { propagatedIds: [side.id] } })
    // With no model, the version is the top's description, marked a copy.
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        IPC_CHANNELS.LOOK_OVER_DRAFT,
        expect.objectContaining({
          mockupId: side.id,
          carry: expect.objectContaining({
            state: 'offered',
            after: { description: 'Shared', via: 'copy' }
          })
        })
      )
    )
  })
})

describe('look-over:answer-edit', () => {
  /** A pile whose top's edit is on offer on its variant, with the version accepting gives ready. */
  async function offered() {
    const [top, side] = [waiting('top'), waiting('side')]
    repo.piles.createPile([top.id, side.id], top.id)
    await call(IPC_CHANNELS.LOOK_OVER_OPEN)
    await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
      mockupId: top.id,
      title: 'Top',
      description: 'Shared',
      tagIds: []
    })
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        IPC_CHANNELS.LOOK_OVER_DRAFT,
        expect.objectContaining({
          mockupId: side.id,
          carry: expect.objectContaining({ after: expect.anything() })
        })
      )
    )
    return side
  }
  const answer = (mockupId: number, action: string) =>
    call<LookOverItem | null>(IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT, { mockupId, action })

  it('accepts, undoes, dismisses and restores the offer on one variant, answering with its item', async () => {
    const side = await offered()

    const accepted = await answer(side.id, 'accept')
    expect(accepted).toMatchObject({
      success: true,
      data: { mockupId: side.id, description: 'Shared', carry: { state: 'applied' } }
    })
    expect(await answer(side.id, 'undo')).toMatchObject({
      success: true,
      data: { description: '', carry: { state: 'offered' } }
    })
    expect(await answer(side.id, 'dismiss')).toMatchObject({
      success: true,
      data: { carry: { state: 'dismissed' } }
    })
    expect(await answer(side.id, 'restore')).toMatchObject({
      success: true,
      data: { carry: { state: 'offered' } }
    })
  })

  it('answers null for a mockup with nothing in that state, and refuses an unknown answer', async () => {
    const alone = waiting('alone')
    expect(await answer(alone.id, 'accept')).toEqual({ success: true, data: null })
    expect(await answer(alone.id, 'copy')).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })
  })
})

describe('look-over:showing', () => {
  /** A model that holds its first answer until `release`, and lists what it was asked about. */
  function heldModel() {
    const asked: string[] = []
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    provider = {
      id: 'stub',
      name: 'Stub',
      analyze: async (input) => {
        asked.push(input.fileName)
        if (asked.length === 1) await held
        return { title: input.fileName, description: '', tags: [] }
      }
    }
    return { asked, release }
  }
  const showing = (mockupId: number) => call(IPC_CHANNELS.LOOK_OVER_SHOWING, { mockupId })

  it('puts the mockup on screen first in the background queue, then the rest of its pile, and answers where it is', async () => {
    const { asked, release } = heldModel()
    const first = waiting('first')
    const [top, a, b] = [waiting('top'), waiting('a'), waiting('b')]
    repo.piles.createPile([top.id, a.id, b.id], top.id)
    const after = waiting('after')
    const queue = inferenceQueueFor(ctx)
    await queue.enqueue([first.id, top.id, a.id, b.id, after.id])
    await vi.waitFor(() => expect(asked).toEqual(['first']))

    expect(await showing(a.id)).toMatchObject({
      success: true,
      data: { mockupId: a.id, status: 'pending', run: { phase: 'queued' } }
    })
    expect(await showing(first.id)).toMatchObject({
      success: true,
      data: { mockupId: first.id, status: 'sniffing', run: { phase: 'writing' } }
    })
    expect(await showing(9999)).toEqual({ success: true, data: null })
    release()
    await queue.idle()

    expect(asked).toEqual(['first', 'a', 'b', 'top', 'after'])
  })

  it('puts the step Look it over opens on first, as it opens', async () => {
    const { asked, release } = heldModel()
    const piles = [0, 1].map((p) => {
      const rows = ['top', 'x', 'y'].map((n) => waiting(`${n}${p}`))
      repo.piles.createPile(
        rows.map((r) => r.id),
        rows[0]!.id
      )
      repo.mockups.updateMockup(rows[0]!.id, {
        aiStatus: 'ready',
        aiResult: { title: 'Top', description: '', tags: [] }
      })
      return rows
    })
    const queue = inferenceQueueFor(ctx)
    await queue.enqueue([piles[1]![1]!.id, piles[1]![2]!.id, piles[0]![1]!.id, piles[0]![2]!.id])
    await vi.waitFor(() => expect(asked).toEqual(['x1']))

    await call(IPC_CHANNELS.LOOK_OVER_OPEN)
    release()
    await queue.idle()

    expect(asked).toEqual(['x1', 'x0', 'y0', 'y1'])
  })
})

describe('stash channels', () => {
  it('stashes a pile and a single, pushes the counts, and Undo puts the pile back', async () => {
    const test = createTestDb()
    handlers.clear()
    const r = test.repo
    seedTaxonomy(test.db)
    ensureSearchIndex(test.db)
    const pushed = vi.fn()
    const { registerPileHandlers } = await import('./pile')
    registerPileHandlers({
      repo: r,
      push: pushed,
      ai: { activeProvider: async () => null },
      ...undoForTests(r, test.db)
    } as unknown as HandlerContext)

    const mk = (name: string) => {
      const m = r.mockups.createMockup({
        ...sample,
        title: name,
        libraryPath: `/lib/${name}.psd`,
        coverPath: `/lib/${name}.webp`
      })
      r.mockups.setStage([m.id], 'to_stash')
      return m
    }
    const [top, side] = [mk('top'), mk('side')]
    r.piles.createPile([top.id, side.id], top.id)

    // No cover file exists on this machine, so the first try is refused whole.
    expect(await call(IPC_CHANNELS.PILE_STASH, { pileId: top.id })).toEqual({
      success: true,
      data: { ok: false, reason: 'no-cover', mockupIds: [top.id, side.id] }
    })
    expect(pushed).not.toHaveBeenCalled()
    test.sqlite.close()
  })
})

describe('stash with real cover files', () => {
  it('a stash is one entry: its undo puts the pile back in To stash, with its drafts, and redo stashes it again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-stash-undo-'))
    try {
      const test = createTestDb()
      handlers.clear()
      const r = test.repo
      seedTaxonomy(test.db)
      ensureSearchIndex(test.db)
      const undoing = undoForTests(r, test.db)
      const { registerPileHandlers } = await import('./pile')
      registerPileHandlers({
        repo: r,
        push: vi.fn(),
        ai: { activeProvider: async () => null },
        ...undoing
      } as unknown as HandlerContext)
      const mk = (name: string) => {
        const cover = join(dir, `${name}.webp`)
        writeFileSync(cover, 'c')
        const m = r.mockups.createMockup({
          ...sample,
          title: name,
          libraryPath: `/lib/${name}.psd`,
          coverPath: cover
        })
        r.mockups.setStage([m.id], 'to_stash')
        return m
      }
      const [top, side] = [mk('top'), mk('side')]
      r.piles.createPile([top.id, side.id], top.id)
      // Looked over: each has its draft.
      for (const m of [top, side]) {
        r.drafts.ensureDraft(m.id, { title: `draft ${m.id}`, description: '', tagIds: [] })
      }

      const pile = await call<{ undoEntryId: number }>(IPC_CHANNELS.PILE_STASH, { pileId: top.id })
      const id = pile.success ? pile.data.undoEntryId : -1
      expect(await undoing.undo.history.undoEntry(id)).toMatchObject({
        status: 'done',
        label: 'Stash pile'
      })
      for (const m of [top, side]) expect(r.mockups.getMockup(m.id)?.stage).toBe('to_stash')
      expect(r.drafts.getDrafts([top.id, side.id]).size).toBe(2)

      await undoing.undo.history.redo()
      for (const m of [top, side]) expect(r.mockups.getMockup(m.id)?.stage).toBe('stashed')
      test.sqlite.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stashes a pile and a single, pushes the counts, and Undo brings the pile back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-stash-ipc-'))
    try {
      const test = createTestDb()
      handlers.clear()
      const r = test.repo
      seedTaxonomy(test.db)
      ensureSearchIndex(test.db)
      const pushed = vi.fn()
      const { registerPileHandlers } = await import('./pile')
      const undoing = undoForTests(r, test.db)
      registerPileHandlers({
        repo: r,
        push: pushed,
        ai: { activeProvider: async () => null },
        ...undoing
      } as unknown as HandlerContext)

      const mk = (name: string) => {
        const cover = join(dir, `${name}.webp`)
        writeFileSync(cover, 'c')
        const m = r.mockups.createMockup({
          ...sample,
          title: name,
          libraryPath: `/lib/${name}.psd`,
          coverPath: cover
        })
        r.mockups.setStage([m.id], 'to_stash')
        return m
      }
      const [top, side, alone] = [mk('top'), mk('side'), mk('alone')]
      r.piles.createPile([top.id, side.id], top.id)

      const pile = await call<{ ok: true; stashedIds: number[]; undoEntryId: number }>(
        IPC_CHANNELS.PILE_STASH,
        { pileId: top.id }
      )
      // What was stashed and the entry that undoes it, and nothing else.
      expect(pile).toEqual({
        success: true,
        data: { ok: true, stashedIds: expect.any(Array), undoEntryId: expect.any(Number) }
      })
      expect(pile.success && pile.data.stashedIds.sort()).toEqual([top.id, side.id].sort())
      expect(undoing.undo.history.state().undo).toMatchObject({ label: 'Stash pile' })
      expect(pushed).toHaveBeenLastCalledWith(
        IPC_CHANNELS.INBOX_COUNTS_CHANGED,
        expect.objectContaining({ toStash: 1 })
      )

      expect(await call(IPC_CHANNELS.MOCKUP_STASH, { mockupId: alone.id })).toMatchObject({
        data: { ok: true, undoEntryId: expect.any(Number) }
      })
      expect(undoing.undo.history.state().undo).toMatchObject({ label: 'Stash' })
      expect(pushed).toHaveBeenLastCalledWith(
        IPC_CHANNELS.INBOX_COUNTS_CHANGED,
        expect.objectContaining({ toStash: 0 })
      )

      // The pile's own entry, undone after the single's stash: they touch different mockups.
      expect(
        await undoing.undo.history.undoEntry(pile.success ? pile.data.undoEntryId : -1)
      ).toMatchObject({ status: 'done', label: 'Stash pile' })
      expect(r.mockups.getMockup(top.id)?.stage).toBe('to_stash')
      expect(r.mockups.getMockup(side.id)?.stage).toBe('to_stash')
      expect(r.mockups.getMockup(alone.id)?.stage).toBe('stashed')
      test.sqlite.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
