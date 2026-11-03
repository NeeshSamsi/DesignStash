import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
const showOpenDialog = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  app: { getVersion: () => '9.9.9', relaunch: vi.fn(), exit: vi.fn(), quit: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { setBootStatus } from '../boot-status'
import { createSettingsStore } from '../settings'
import { createTestDb } from '../db/repositories/__tests__/setup'
import type { Repository } from '../db/repository'
import { registerPreAppHandlers } from './index'

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

let dir: string
let copied: string[]
let sqlite: { close(): void } | null = null

/** Register the pre-app set the way launch does: with a repo when the library opened. */
function register(repo: Repository | null): void {
  handlers.clear()
  registerPreAppHandlers({
    settings: createSettingsStore(dir),
    repo,
    writeClipboard: (t) => copied.push(t),
    version: () => '0.4.0'
  })
}

beforeEach(() => {
  handlers.clear()
  copied = []
  dir = mkdtempSync(join(tmpdir(), 'ds-boot-ipc-'))
  register(null)
})

afterEach(() => {
  sqlite?.close()
  sqlite = null
  setBootStatus({ state: 'ok' })
  rmSync(dir, { recursive: true, force: true })
})

describe('BOOT_STATUS', () => {
  it('reports ok by default', async () => {
    expect(await call(IPC_CHANNELS.BOOT_STATUS)).toEqual({
      success: true,
      data: { state: 'ok', backupKept: false }
    })
  })

  it.each(['library-failed', 'folder-unavailable', 'settings-corrupt'] as const)(
    'reports %s',
    async (state) => {
      setBootStatus(state === 'settings-corrupt' ? { state, backupKept: true } : { state })
      expect(await call(IPC_CHANNELS.BOOT_STATUS)).toEqual({
        success: true,
        data: { state, backupKept: state === 'settings-corrupt' }
      })
    }
  )
})

describe('BOOT_CHECK_FOLDER', () => {
  it('says whether a chosen folder is usable and holds a library, and how many mockups it has', async () => {
    const stash = join(dir, 'Old stash')
    mkdirSync(stash)
    const db = new Database(join(stash, 'designstash.db'))
    db.exec('CREATE TABLE mockups (id integer primary key, deleted_at text)')
    const add = db.prepare('INSERT INTO mockups (deleted_at) VALUES (NULL)')
    for (let i = 0; i < 12; i++) add.run()
    db.close()

    expect(await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: stash })).toEqual({
      success: true,
      data: { state: 'ok', hasLibrary: true, mockupCount: 12 }
    })
  })

  it('has no count for a library it cannot read, or a folder without one', async () => {
    writeFileSync(join(dir, 'designstash.db'), '')
    expect(await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: dir })).toEqual({
      success: true,
      data: { state: 'ok', hasLibrary: true, mockupCount: null }
    })
    const empty = join(dir, 'Empty')
    mkdirSync(empty)
    expect(await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: empty })).toEqual({
      success: true,
      data: { state: 'ok', hasLibrary: false, mockupCount: null }
    })
  })

  it('says missing for a folder that is not there, and never echoes the path', async () => {
    const result = await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: join(dir, 'gone') })
    expect(result).toEqual({
      success: true,
      data: { state: 'missing', hasLibrary: false, mockupCount: null }
    })
    expect(JSON.stringify(result)).not.toContain(dir)
  })

  it('refuses an empty path', async () => {
    const result = await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: '' })
    expect(result.success).toBe(false)
  })
})

describe('the pre-app set when the library did not open', () => {
  it('registers every channel BootGate and onboarding call', () => {
    for (const channel of [
      IPC_CHANNELS.BOOT_STATUS,
      IPC_CHANNELS.BOOT_CHECK_FOLDER,
      IPC_CHANNELS.SETTINGS_GET,
      IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT,
      IPC_CHANNELS.DIALOG_SELECT_DIRECTORY,
      IPC_CHANNELS.REPORT_COPY,
      IPC_CHANNELS.APP_RELAUNCH,
      IPC_CHANNELS.APP_RELOAD,
      IPC_CHANNELS.APP_QUIT
    ]) {
      expect(handlers.has(channel), channel).toBe(true)
    }
  })

  it('answers settings and the folder picker', async () => {
    expect(await call(IPC_CHANNELS.SETTINGS_GET)).toMatchObject({ success: true })
    expect(
      await call(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, { path: join(dir, 'Stash') })
    ).toEqual({ success: true, data: { libraryRoot: join(dir, 'Stash') } })
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/Volumes/Studio'] })
    expect(await call(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY)).toEqual({
      success: true,
      data: { path: '/Volumes/Studio' }
    })
  })

  it('copies a report without the library counts', async () => {
    expect(await call(IPC_CHANNELS.REPORT_COPY)).toEqual({ success: true, data: { copied: true } })
    expect(copied[0]).toContain('Version: 0.4.0')
    expect(copied[0]).toContain('Mockups in My Stash: unavailable')
  })
})

describe('REPORT_COPY with an open library', () => {
  it('copies a scrubbed report with counts, without sending the text back', async () => {
    const test = createTestDb()
    sqlite = test.sqlite
    register(test.repo)
    createSettingsStore(dir).update({ activeModelId: '/Users/me/models/secret.gguf' })
    register(test.repo)

    expect(await call(IPC_CHANNELS.REPORT_COPY)).toEqual({ success: true, data: { copied: true } })
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('Version: 0.4.0')
    expect(copied[0]).toContain('Mockups in My Stash: 0')
    expect(copied[0]).toContain('Stash check: not checked yet')
    expect(copied[0]).not.toContain('/Users')
    expect(copied[0]).toContain('<path>')
  })
})

describe('REPORT_COPY: preview, send and copy-full', () => {
  const sent: { message: string; details: string }[] = []
  function registerWithReporter(outcome: 'sent' | 'queued' | 'unavailable'): void {
    handlers.clear()
    sent.length = 0
    registerPreAppHandlers({
      settings: createSettingsStore(dir),
      repo: null,
      writeClipboard: (t) => copied.push(t),
      version: () => '0.4.0',
      reporter: {
        send: (message, details) => {
          sent.push({ message, details })
          return Promise.resolve(outcome)
        }
      },
      logTail: () => '[INFO] opened /Users/me/Pictures\n[WARN] slow',
      crashLine: () => 'none in the last 7 days'
    })
  }

  it('previews the exact text Send carries: facts, crashes and the scrubbed log tail', async () => {
    registerWithReporter('sent')
    const res = await call<{ text: string }>(IPC_CHANNELS.REPORT_COPY, { action: 'preview' })
    const text = res.success ? res.data.text : ''
    expect(text).toContain('Version: 0.4.0')
    expect(text).toContain('Crashes: none in the last 7 days')
    expect(text).toContain('[WARN] slow')
    expect(text).not.toContain('/Users')
    expect(copied).toEqual([])
  })

  it('sends the message with the previewed text and reports the outcome', async () => {
    registerWithReporter('queued')
    const preview = await call<{ text: string }>(IPC_CHANNELS.REPORT_COPY, { action: 'preview' })
    const res = await call(IPC_CHANNELS.REPORT_COPY, { action: 'send', message: 'It froze' })
    expect(res).toEqual({ success: true, data: { copied: false, outcome: 'queued' } })
    expect(sent).toEqual([{ message: 'It froze', details: preview.success ? preview.data.text : '' }])
  })

  it('says unavailable when no reporter is wired', async () => {
    register(null)
    expect(await call(IPC_CHANNELS.REPORT_COPY, { action: 'send', message: 'x' })).toEqual({
      success: true,
      data: { copied: false, outcome: 'unavailable' }
    })
  })

  it('copy-full puts the message above the full text on the clipboard', async () => {
    registerWithReporter('sent')
    await call(IPC_CHANNELS.REPORT_COPY, { action: 'copy-full', message: 'It froze' })
    expect(copied[0]?.startsWith('It froze\n\nDesignStash problem report')).toBe(true)
    expect(copied[0]).toContain('[WARN] slow')
  })
})
