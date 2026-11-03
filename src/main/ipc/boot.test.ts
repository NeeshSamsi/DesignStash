import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { setBootStatus } from '../boot-status'
import { registerBootHandlers } from './boot'

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

let dir: string

beforeEach(() => {
  handlers.clear()
  dir = mkdtempSync(join(tmpdir(), 'ds-boot-ipc-'))
  registerBootHandlers()
})

afterEach(() => {
  setBootStatus({ state: 'ok', backupKept: false })
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
      setBootStatus({ state, backupKept: state === 'settings-corrupt' })
      expect(await call(IPC_CHANNELS.BOOT_STATUS)).toEqual({
        success: true,
        data: { state, backupKept: state === 'settings-corrupt' }
      })
    }
  )
})

describe('BOOT_CHECK_FOLDER', () => {
  it('says whether a chosen folder is usable and holds a library', async () => {
    writeFileSync(join(dir, 'designstash.db'), '')
    expect(await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: dir })).toEqual({
      success: true,
      data: { state: 'ok', hasLibrary: true }
    })
  })

  it('says missing for a folder that is not there, and never echoes the path', async () => {
    const result = await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: join(dir, 'gone') })
    expect(result).toEqual({ success: true, data: { state: 'missing', hasLibrary: false } })
    expect(JSON.stringify(result)).not.toContain(dir)
  })

  it('refuses an empty path', async () => {
    const result = await call(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path: '' })
    expect(result.success).toBe(false)
  })
})
