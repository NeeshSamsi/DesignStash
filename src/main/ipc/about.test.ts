import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import { createSettingsStore } from '../settings'
import { createTestDb } from '../db/repositories/__tests__/setup'
import { NoopUpdateService } from '../updates/update-service'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app', getVersion: () => '9.9.9' },
  clipboard: { writeText: vi.fn() },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { registerAboutHandlers } from './about'

let sqlite: Database.Database
let base: string

const call = async <T = unknown>(channel: string): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, undefined)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  base = mkdtempSync(join(tmpdir(), 'ds-about-'))
  const test = createTestDb()
  sqlite = test.sqlite
  const settings = createSettingsStore(base)
  settings.update({ activeModelId: '/Users/me/models/secret.gguf' })
  registerAboutHandlers({ settings, repo: test.repo } as unknown as HandlerContext, {
    updates: new NoopUpdateService(settings, () => new Date('2026-10-20T03:00:00.000Z')),
    packages: {
      readApp: () => ({ license: 'MIT', dependencies: { zod: '^4' } }),
      readDependency: () => ({ version: '4.0.0', license: 'MIT' })
    }
  })
})

afterEach(() => {
  sqlite.close()
  rmSync(base, { recursive: true, force: true })
})

describe('updates', () => {
  it('reads up to date, then remembers the check', async () => {
    expect(await call(IPC_CHANNELS.UPDATES_STATUS)).toEqual({
      success: true,
      data: { state: 'up-to-date', lastCheckedAt: null }
    })
    expect(await call(IPC_CHANNELS.UPDATES_CHECK)).toEqual({
      success: true,
      data: { state: 'up-to-date', lastCheckedAt: '2026-10-20T03:00:00.000Z' }
    })
    expect(await call(IPC_CHANNELS.UPDATES_CANCEL)).toMatchObject({ data: { state: 'up-to-date' } })
    expect(await call(IPC_CHANNELS.UPDATES_INSTALL)).toEqual({
      success: true,
      data: { installing: false }
    })
  })
})

describe('licences', () => {
  it('returns the notice text', async () => {
    const res = await call<{ text: string }>(IPC_CHANNELS.LICENCES_TEXT)
    expect(res.success && res.data.text).toContain('zod 4.0.0  MIT')
  })
})
