import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { StashCheckStatus } from '@shared/stash'
import { createSettingsStore } from '../settings'
import { createTestDb, approvedMockup } from '../db/repositories/__tests__/setup'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, fn) }
}))

import { registerIntegrityHandlers } from './integrity'

let sqlite: Database.Database
let base: string

const call = async <T = unknown>(channel: string): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, undefined)) as IpcResult<T>

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
    expect(await call(IPC_CHANNELS.STASH_CHECK_STATUS)).toEqual({ success: true, data: { lastRun: null } })
  })

  it('Check now records what it found, and the status then reads it back', async () => {
    const run = await call<StashCheckStatus>(IPC_CHANNELS.STASH_CHECK_RUN)
    expect(run.success && run.data.lastRun).toMatchObject({ trigger: 'manual', result: 'review', toReview: 1 })

    const status = await call<StashCheckStatus>(IPC_CHANNELS.STASH_CHECK_STATUS)
    expect(status).toEqual(run)
    expect(JSON.stringify(status)).not.toContain(base)
  })
})
