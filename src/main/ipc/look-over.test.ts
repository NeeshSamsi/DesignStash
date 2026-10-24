import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { LookOverItem, LookOverQueue } from '@shared/approval'
import type { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
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

import { registerApprovalHandlers } from './approval'

let sqlite: Database.Database
let repo: Repository
let push: ReturnType<typeof vi.fn>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  seedTaxonomy(test.db)
  ensureSearchIndex(test.db)
  push = vi.fn()
  registerApprovalHandlers({
    repo,
    push,
    ai: { activeProvider: async () => null },
    telemetry: { get: () => ({ track: vi.fn() }) },
    settings: { getLibraryRoot: () => '/library' }
  } as unknown as HandlerContext)
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
        expect.objectContaining({ mockupId: side.id, carry: expect.objectContaining({ state: 'offered', after: { description: 'Shared', via: 'copy' } }) })
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
    await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, { mockupId: top.id, title: 'Top', description: 'Shared', tagIds: [] })
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_DRAFT, expect.objectContaining({ mockupId: side.id, carry: expect.objectContaining({ after: expect.anything() }) }))
    )
    return side
  }
  const answer = (mockupId: number, action: string) => call<LookOverItem | null>(IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT, { mockupId, action })

  it("accepts, undoes, dismisses and restores the offer on one variant, answering with its item", async () => {
    const side = await offered()

    const accepted = await answer(side.id, 'accept')
    expect(accepted).toMatchObject({ success: true, data: { mockupId: side.id, description: 'Shared', carry: { state: 'applied' } } })
    expect(await answer(side.id, 'undo')).toMatchObject({ success: true, data: { description: '', carry: { state: 'offered' } } })
    expect(await answer(side.id, 'dismiss')).toMatchObject({ success: true, data: { carry: { state: 'dismissed' } } })
    expect(await answer(side.id, 'restore')).toMatchObject({ success: true, data: { carry: { state: 'offered' } } })
  })

  it('answers null for a mockup with nothing in that state, and refuses an unknown answer', async () => {
    const alone = waiting('alone')
    expect(await answer(alone.id, 'accept')).toEqual({ success: true, data: null })
    expect(await answer(alone.id, 'copy')).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
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
      ai: { activeProvider: async () => null }
    } as unknown as HandlerContext)

    const mk = (name: string) => {
      const m = r.mockups.createMockup({ ...sample, title: name, libraryPath: `/lib/${name}.psd`, coverPath: `/lib/${name}.webp` })
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

  it('rejects a snapshot that is not the right shape', async () => {
    const test = createTestDb()
    handlers.clear()
    const { registerPileHandlers } = await import('./pile')
    registerPileHandlers({ repo: test.repo, push: vi.fn(), ai: { activeProvider: async () => null } } as unknown as HandlerContext)
    expect(await call(IPC_CHANNELS.PILE_UNSTASH, { snapshot: { mockups: 'no' } })).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })
    test.sqlite.close()
  })
})

describe('stash with real cover files', () => {
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
      registerPileHandlers({ repo: r, push: pushed, ai: { activeProvider: async () => null } } as unknown as HandlerContext)

      const mk = (name: string) => {
        const cover = join(dir, `${name}.webp`)
        writeFileSync(cover, 'c')
        const m = r.mockups.createMockup({ ...sample, title: name, libraryPath: `/lib/${name}.psd`, coverPath: cover })
        r.mockups.setStage([m.id], 'to_stash')
        return m
      }
      const [top, side, alone] = [mk('top'), mk('side'), mk('alone')]
      r.piles.createPile([top.id, side.id], top.id)

      const pile = await call<{ ok: true; stashedIds: number[]; snapshot: unknown }>(IPC_CHANNELS.PILE_STASH, { pileId: top.id })
      expect(pile.success && pile.data.stashedIds.sort()).toEqual([top.id, side.id].sort())
      expect(pushed).toHaveBeenLastCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.objectContaining({ toStash: 1 }))

      expect(await call(IPC_CHANNELS.MOCKUP_STASH, { mockupId: alone.id })).toMatchObject({ data: { ok: true } })
      expect(pushed).toHaveBeenLastCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.objectContaining({ toStash: 0 }))

      const undo = await call<{ restoredIds: number[] }>(IPC_CHANNELS.PILE_UNSTASH, {
        snapshot: pile.success ? pile.data.snapshot : null
      })
      expect(undo.success && undo.data.restoredIds.sort()).toEqual([top.id, side.id].sort())
      expect(r.mockups.getMockup(top.id)?.stage).toBe('to_stash')
      expect(r.mockups.getMockup(alone.id)?.stage).toBe('stashed')
      test.sqlite.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
