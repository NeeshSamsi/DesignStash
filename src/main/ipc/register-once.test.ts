import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsStore } from '../settings'
import { createTestDb } from '../db/repositories/__tests__/setup'
import { LibraryService } from '../library/library-service'
import type { HandlerContext } from './context'

const registered = vi.hoisted(() => [] as string[])
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '1', getAppPath: () => '/app', on: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
  ipcMain: {
    handle: (channel: string) => {
      if (registered.includes(channel))
        throw new Error(`Attempted to register a second handler for '${channel}'`)
      registered.push(channel)
    }
  }
}))
vi.mock('../db/connection', () => ({ getDb: vi.fn(), getSqlite: vi.fn() }))

import { registerAllHandlers, registerPreAppHandlers } from './index'

describe('handler registration', () => {
  it('registers every channel exactly once across the pre-app set and the library set', () => {
    const base = mkdtempSync(join(tmpdir(), 'ds-register-once-'))
    const { sqlite, repo } = createTestDb()
    const settings = createSettingsStore(base)
    registerPreAppHandlers({ settings, repo: null })
    // Only registration is under test, so the AI runtime is a stub whose methods do nothing.
    const quiet = new Proxy({}, { get: () => async () => undefined })
    const ctx = {
      settings,
      telemetry: { get: () => quiet, rebuild: vi.fn() },
      repo,
      library: new LibraryService(repo, settings.getLibraryRoot(), { openPath: vi.fn() }),
      ai: {
        modelsDir: base,
        downloader: quiet,
        activeDownloads: new Map(),
        activeProvider: async () => null
      },
      push: vi.fn()
    } as unknown as HandlerContext
    registerAllHandlers(ctx)

    expect(new Set(registered).size).toBe(registered.length)
    expect(registered).toContain(IPC_CHANNELS.SETTINGS_GET)
    expect(registered).toContain(IPC_CHANNELS.STASH_INFO)
    sqlite.close()
    rmSync(base, { recursive: true, force: true })
  })
})
