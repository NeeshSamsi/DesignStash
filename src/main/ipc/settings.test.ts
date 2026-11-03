import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, PUSH_CHANNELS, PUSH_CONTRACT, type IpcResult } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { createSettingsStore, type SettingsStore } from '../settings'
import { createTestDb } from '../db/repositories/__tests__/setup'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3' },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))
vi.mock('../db/connection', () => ({ getDb: vi.fn(), getSqlite: vi.fn() }))

import { registerAppHandlers } from './app'
import { registerSettingsHandlers } from './settings'

let sqlite: Database.Database
let repo: Repository
let base: string
let settings: SettingsStore
let relaunch: ReturnType<typeof vi.fn<() => void>>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  base = mkdtempSync(join(tmpdir(), 'ds-settings-ipc-'))
  settings = createSettingsStore(base)
  mkdirSync(settings.getLibraryRoot(), { recursive: true })
  ;({ sqlite, repo } = createTestDb())
  relaunch = vi.fn<() => void>()
  registerSettingsHandlers({ settings, repo, push: vi.fn() } as unknown as HandlerContext)
  registerAppHandlers(relaunch)
})

afterEach(() => {
  sqlite.close()
  rmSync(base, { recursive: true, force: true })
  vi.useRealTimers()
})

describe('stash channels', () => {
  it('reports the stash folder', async () => {
    expect(await call(IPC_CHANNELS.STASH_INFO)).toEqual({
      success: true,
      data: { path: settings.getLibraryRoot(), count: 0, bytes: 0, restartRequired: false }
    })
  })

  it('points at an existing folder and asks for a restart', async () => {
    const other = join(base, 'Other')
    mkdirSync(other)
    expect(await call(IPC_CHANNELS.STASH_CHANGE, { path: other, mode: 'point' })).toEqual({
      success: true,
      data: { ok: true, restartRequired: true }
    })
    expect(await call(IPC_CHANNELS.STASH_INFO)).toMatchObject({
      data: { path: other, restartRequired: true }
    })
  })

  it('answers a refusal with a plain reason and no path', async () => {
    const res = await call(IPC_CHANNELS.STASH_CHANGE, {
      path: settings.getLibraryRoot(),
      mode: 'move'
    })
    expect(res).toEqual({ success: true, data: { ok: false, reason: 'same-folder' } })
    expect(JSON.stringify(res)).not.toContain(base)
  })

  it('refuses a move into a folder that has things in it', async () => {
    const busy = join(base, 'Busy')
    mkdirSync(busy)
    writeFileSync(join(busy, 'x.txt'), 'x')
    expect(await call(IPC_CHANNELS.STASH_CHANGE, { path: busy, mode: 'move' })).toMatchObject({
      data: { ok: false, reason: 'not-empty' }
    })
  })

  it('has a push channel for move progress', () => {
    expect(PUSH_CHANNELS).toContain(IPC_CHANNELS.STASH_MOVE_PROGRESS)
    const { payload } = PUSH_CONTRACT[IPC_CHANNELS.STASH_MOVE_PROGRESS]
    expect(
      payload.safeParse({
        phase: 'copying',
        copiedFiles: 1,
        totalFiles: 4,
        copiedBytes: 10,
        totalBytes: 40
      }).success
    ).toBe(true)
    expect(payload.safeParse({ phase: 'nope' }).success).toBe(false)
  })
})

describe('APP_RELAUNCH', () => {
  it('answers first, then restarts', async () => {
    vi.useFakeTimers()
    const res = await call(IPC_CHANNELS.APP_RELAUNCH)
    expect(res).toEqual({ success: true, data: { relaunching: true } })
    expect(relaunch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(relaunch).toHaveBeenCalledTimes(1)
  })
})
