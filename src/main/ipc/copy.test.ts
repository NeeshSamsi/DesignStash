import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, IPC_CONTRACT, PUSH_CHANNELS, type IpcResult } from '@shared/ipc'
import type { CopyStatus } from '@shared/ipc/import'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb } from '../db/repositories/__tests__/setup'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, fn) }
}))
// Reading a real PSD preview needs real PSDs; the copy itself is what is under test here.
vi.mock('../psd', () => ({
  resolveCover: async (input: { outDir: string }) => {
    const { writeFileSync: write } = await import('node:fs')
    const { join: j } = await import('node:path')
    write(j(input.outDir, 'cover.webp'), 'c')
    return { source: 'embedded', coverPath: j(input.outDir, 'cover.webp'), thumbPath: j(input.outDir, 'thumb.webp') }
  },
  collectCandidateImages: () => []
}))

import { registerImportHandlers } from './import'

let sqlite: Database.Database
let repo: Repository
let base: string
let drop: string
let push: ReturnType<typeof vi.fn>
let analyze: ReturnType<typeof vi.fn>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

const settle = async () => {
  for (let i = 0; i < 40; i++) {
    const res = await call<{ haul: CopyStatus | null }>(IPC_CHANNELS.COPY_STATUS)
    if (res.success && res.data.haul?.state !== 'running') return res
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('never settled')
}

beforeEach(() => {
  handlers.clear()
  base = mkdtempSync(join(tmpdir(), 'ds-copy-ipc-'))
  drop = join(base, 'drop')
  mkdirSync(drop)
  mkdirSync(join(base, 'Library'))
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  push = vi.fn()
  analyze = vi.fn(async () => ({ title: 'T', description: '', tags: [] }))
  registerImportHandlers({
    repo,
    push,
    settings: { getLibraryRoot: () => join(base, 'Library') },
    telemetry: { get: () => ({ track: vi.fn() }) },
    ai: { activeProvider: async () => ({ id: 's', name: 's', analyze }) }
  } as unknown as HandlerContext)
})

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50))
  sqlite.close()
  rmSync(base, { recursive: true, force: true })
})

describe('copy channels', () => {
  it('copies a drop, pushes progress and counts, and sends landed files to the AI queue', async () => {
    writeFileSync(join(drop, 'a.psd'), 'AAAA')
    writeFileSync(join(drop, 'b.psd'), 'BBBB')

    const started = await call<CopyStatus>(IPC_CHANNELS.COPY_START, { paths: [drop] })
    expect(started).toMatchObject({ success: true, data: { state: 'running', total: 2 } })

    const done = await settle()
    expect(done.success && done.data.haul).toMatchObject({ state: 'done', landed: 2 })
    expect(repo.getInboxList('to_sort')).toHaveLength(2)

    expect(push).toHaveBeenCalledWith(IPC_CHANNELS.COPY_PROGRESS, expect.objectContaining({ state: 'done', landed: 2 }))
    expect(push).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.objectContaining({ toSort: 2 }))
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(2))
    expect(JSON.stringify(push.mock.calls)).not.toContain(base)
  })

  it('Undo all removes what landed and pushes the counts', async () => {
    writeFileSync(join(drop, 'a.psd'), 'AAAA')
    const started = await call<CopyStatus>(IPC_CHANNELS.COPY_START, { paths: [drop] })
    await settle()

    const res = await call<{ tossedIds: number[] }>(IPC_CHANNELS.COPY_UNDO_ALL, {
      haulId: started.success ? started.data.haulId : ''
    })

    expect(res.success && res.data.tossedIds).toHaveLength(1)
    expect(repo.getInboxList('to_sort')).toEqual([])
    expect(push).toHaveBeenLastCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.objectContaining({ toSort: 0 }))
  })

  it('Cancel answers with what landed so far, and Retry on an unknown haul is an error', async () => {
    expect(await call(IPC_CHANNELS.COPY_CANCEL, { haulId: 'nope' })).toEqual({
      success: true,
      data: { landedIds: [] }
    })
    expect(await call(IPC_CHANNELS.COPY_RETRY, { haulId: 'nope' })).toMatchObject({ success: false })
  })

  it('has no haul before the first drop, and rejects an empty drop', async () => {
    expect(await call(IPC_CHANNELS.COPY_STATUS)).toEqual({ success: true, data: { haul: null } })
    expect(await call(IPC_CHANNELS.COPY_START, { paths: [] })).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' }
    })
  })

  it('has a push channel for copy progress', () => {
    expect(PUSH_CHANNELS).toContain(IPC_CHANNELS.COPY_PROGRESS)
    const { request } = IPC_CONTRACT[IPC_CHANNELS.COPY_PROGRESS]
    expect(
      request.safeParse({
        haulId: 'h', state: 'paused', pauseReason: 'disk-full', total: 3, landed: 1,
        skipped: { notPsd: 0, duplicate: 1, unreadable: 0 }, file: null
      }).success
    ).toBe(true)
    expect(request.safeParse({ haulId: 'h', state: 'nope' }).success).toBe(false)
  })
})
