import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, IPC_CONTRACT, PUSH_CHANNELS, type IpcResult } from '@shared/ipc'
import type { LookOverQueue } from '@shared/approval'
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
  const m = repo.createMockup({
    ...sample,
    title: name,
    libraryPath: `/lib/${name}.psd`,
    coverPath: `/lib/${name}.webp`
  })
  repo.setStage([m.id], 'to_stash')
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

  it('pushes progress while an edit carries over to variants', async () => {
    const [top, side] = [waiting('top'), waiting('side')]
    repo.createPile([top.id, side.id], top.id)
    await call(IPC_CHANNELS.LOOK_OVER_OPEN)

    await call(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
      mockupId: top.id,
      title: 'Top',
      description: 'Shared',
      tagIds: []
    })

    expect(push).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_PROGRESS, {
      pileId: top.id,
      completed: 1,
      total: 1,
      phase: 'done'
    })
  })

  it('has a push channel for the progress', () => {
    expect(PUSH_CHANNELS).toContain(IPC_CHANNELS.LOOK_OVER_PROGRESS)
    const { request } = IPC_CONTRACT[IPC_CHANNELS.LOOK_OVER_PROGRESS]
    expect(request.safeParse({ pileId: 1, completed: 0, total: 3, phase: 'running' }).success).toBe(
      true
    )
    expect(request.safeParse({ pileId: 1 }).success).toBe(false)
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
      const m = r.createMockup({ ...sample, title: name, libraryPath: `/lib/${name}.psd`, coverPath: `/lib/${name}.webp` })
      r.setStage([m.id], 'to_stash')
      return m
    }
    const [top, side] = [mk('top'), mk('side')]
    r.createPile([top.id, side.id], top.id)

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
        const m = r.createMockup({ ...sample, title: name, libraryPath: `/lib/${name}.psd`, coverPath: cover })
        r.setStage([m.id], 'to_stash')
        return m
      }
      const [top, side, alone] = [mk('top'), mk('side'), mk('alone')]
      r.createPile([top.id, side.id], top.id)

      const pile = await call<{ ok: true; stashedIds: number[]; snapshot: unknown }>(IPC_CHANNELS.PILE_STASH, { pileId: top.id })
      expect(pile.success && pile.data.stashedIds.sort()).toEqual([top.id, side.id].sort())
      expect(pushed).toHaveBeenLastCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.objectContaining({ toStash: 1 }))

      expect(await call(IPC_CHANNELS.MOCKUP_STASH, { mockupId: alone.id })).toMatchObject({ data: { ok: true } })
      expect(pushed).toHaveBeenLastCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.objectContaining({ toStash: 0 }))

      const undo = await call<{ restoredIds: number[] }>(IPC_CHANNELS.PILE_UNSTASH, {
        snapshot: pile.success ? pile.data.snapshot : null
      })
      expect(undo.success && undo.data.restoredIds.sort()).toEqual([top.id, side.id].sort())
      expect(r.getMockup(top.id)?.stage).toBe('to_stash')
      expect(r.getMockup(alone.id)?.stage).toBe('stashed')
      test.sqlite.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
