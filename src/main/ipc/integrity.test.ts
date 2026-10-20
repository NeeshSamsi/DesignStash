import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { StashCheckStatus } from '@shared/stash'
import { createSettingsStore } from '../settings'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, approvedMockup } from '../db/repositories/__tests__/setup'
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

import { registerIntegrityHandlers } from './integrity'

let sqlite: Database.Database
let base: string

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  base = mkdtempSync(join(tmpdir(), 'ds-integrity-'))
  const test = createTestDb()
  sqlite = test.sqlite
  const settings = createSettingsStore(base)
  test.repo.createMockup(approvedMockup({ title: 'Gone', libraryPath: join(base, 'missing.psd') }))
  registerIntegrityHandlers({ settings, repo: test.repo } as unknown as HandlerContext)
})

afterEach(() => {
  sqlite.close()
  rmSync(base, { recursive: true, force: true })
})

describe('stash check status channels', () => {
  it('has no last run before the first check', async () => {
    expect(await call(IPC_CHANNELS.STASH_CHECK_STATUS)).toEqual({
      success: true,
      data: { lastRun: null }
    })
  })

  it('Check now records what it found, and the status then reads it back', async () => {
    const run = await call<StashCheckStatus>(IPC_CHANNELS.STASH_CHECK_RUN)
    expect(run.success && run.data.lastRun).toMatchObject({
      trigger: 'manual',
      result: 'review',
      toReview: 1
    })

    const status = await call<StashCheckStatus>(IPC_CHANNELS.STASH_CHECK_STATUS)
    expect(status).toEqual(run)
    expect(JSON.stringify(status)).not.toContain(base)
  })
})

describe('resolving changes', () => {
  const pushed: { channel: string; payload: unknown }[] = []
  let picked: string | null = null
  let ctx: HandlerContext

  beforeEach(() => {
    handlers.clear()
    pushed.length = 0
    picked = null
    const test = createTestDb()
    sqlite.close()
    sqlite = test.sqlite
    ensureSearchIndex(test.db)
    const settings = createSettingsStore(base)
    ctx = {
      settings,
      repo: test.repo,
      ai: { activeProvider: async () => null },
      push: (channel: string, payload: unknown) => void pushed.push({ channel, payload })
    } as unknown as HandlerContext
    registerIntegrityHandlers(ctx, async () => picked)
  })

  const goneRow = () =>
    ctx.repo.createMockup(
      approvedMockup({
        title: 'Glass iPhone 14',
        libraryPath: join(base, 'Library', 'mockups', 'g', 'original.psd')
      })
    )

  it('reports names and opaque ids, never a path', async () => {
    goneRow()
    const result = await call<{ gone: { id: string; name: string }[] }>(
      IPC_CHANNELS.INTEGRITY_REPORT
    )
    expect(result.success && result.data.gone[0]).toMatchObject({ name: 'Glass iPhone 14' })
    expect(JSON.stringify(result)).not.toContain(base)
  })

  it('Ignore all hides everything, Undo brings it back, and the list persists in settings', async () => {
    goneRow()
    const ignored = await call<{ ignoredIds: string[] }>(IPC_CHANNELS.INTEGRITY_IGNORE_ALL)
    expect(ignored.success && ignored.data.ignoredIds).toHaveLength(1)
    expect(createSettingsStore(base).get().ignoredDrift).toHaveLength(1)

    const report = await call<{ gone: unknown[] }>(IPC_CHANNELS.INTEGRITY_REPORT)
    expect(report.success && report.data.gone).toEqual([])

    await call(IPC_CHANNELS.INTEGRITY_UNIGNORE, {
      ids: ignored.success ? ignored.data.ignoredIds : []
    })
    const back = await call<{ gone: unknown[] }>(IPC_CHANNELS.INTEGRITY_REPORT)
    expect(back.success && back.data.gone).toHaveLength(1)
  })

  it('refuses an empty id list', async () => {
    const result = await call(IPC_CHANNELS.INTEGRITY_IGNORE, { ids: [] })
    expect(result.success).toBe(false)
  })

  it('Remove drops the record and updates the stash check status', async () => {
    const gone = goneRow()
    const removed = await call<{ removed: number }>(IPC_CHANNELS.INTEGRITY_REMOVE, {
      ids: [`m${gone.id}`]
    })
    expect(removed).toEqual({ success: true, data: { removed: 1 } })
    expect(ctx.repo.getMockup(gone.id)).toBeUndefined()
    const status = await call<StashCheckStatus>(IPC_CHANNELS.STASH_CHECK_STATUS)
    expect(status.success && status.data.lastRun).toMatchObject({ result: 'in-sync' })
  })

  it('Relink opens the dialog in main and reports a cancel', async () => {
    const gone = goneRow()
    const result = await call(IPC_CHANNELS.INTEGRITY_RELINK, { id: `m${gone.id}` })
    expect(result).toEqual({ success: true, data: { outcome: 'cancelled' } })
  })

  it('Relink refuses a file that is not a PSD', async () => {
    const gone = goneRow()
    picked = '/x/photo.png'
    expect(await call(IPC_CHANNELS.INTEGRITY_RELINK, { id: `m${gone.id}` })).toEqual({
      success: true,
      data: { outcome: 'not-psd' }
    })
  })

  it('Add puts a found file in To sort, pushes the counts and can be undone', async () => {
    const dir = join(base, 'Library', 'mockups', 'x1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'poster_new.psd'), 'not a real psd')
    const report = await call<{ found: { id: string }[] }>(IPC_CHANNELS.INTEGRITY_REPORT)
    const id = report.success ? report.data.found[0]!.id : ''

    const added = await call<{ mockupIds: number[] }>(IPC_CHANNELS.INTEGRITY_ADD, { ids: [id] })
    const mockupIds = added.success ? added.data.mockupIds : []
    expect(mockupIds).toHaveLength(1)
    expect(ctx.repo.getMockup(mockupIds[0]!)).toMatchObject({
      stage: 'to_sort',
      title: 'poster_new'
    })
    expect(pushed.some((p) => p.channel === IPC_CHANNELS.INBOX_COUNTS_CHANGED)).toBe(true)

    await call(IPC_CHANNELS.INTEGRITY_UNDO_ADD, { mockupIds })
    expect(ctx.repo.getMockup(mockupIds[0]!)).toBeUndefined()
  })
})
