import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { createSettingsStore } from '../settings'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
const paths = vi.hoisted(() => ({ userData: '', home: '' }))
vi.mock('electron', () => ({
  app: {
    getPath: (name: 'userData' | 'home') => paths[name],
    relaunch: vi.fn(),
    exit: vi.fn()
  },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))
vi.mock('../db/connection', () => ({ closeDb: vi.fn() }))

import { app } from 'electron'
import { registerDebugHandlers } from './debug'

let base: string

beforeEach(() => {
  handlers.clear()
  base = mkdtempSync(join(tmpdir(), 'ds-debug-ipc-'))
  paths.userData = join(base, 'userData')
  paths.home = join(base, 'home')
  mkdirSync(paths.userData)
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

const write = (path: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'x')
}

describe('DEBUG_RESET_APP', () => {
  it('removes app data and the stash, and leaves a models folder beside a custom stash alone', async () => {
    const stash = join(base, 'Design', 'Stash')
    const settings = createSettingsStore(paths.userData)
    settings.update({ libraryRoot: stash })
    write(join(stash, 'designstash.db'))
    write(join(paths.userData, 'models', 'qwen3-vl-4b', 'model.gguf'))
    // Someone's own folder that happens to sit next to the stash.
    write(join(base, 'Design', 'models', 'car.obj'))
    registerDebugHandlers(settings)

    await handlers.get(IPC_CHANNELS.DEBUG_RESET_APP)!(null, undefined)

    expect(existsSync(join(stash, 'designstash.db'))).toBe(false)
    expect(existsSync(join(paths.userData, 'models'))).toBe(false)
    expect(existsSync(join(base, 'Design', 'models', 'car.obj'))).toBe(true)
    expect(app.relaunch).toHaveBeenCalled()
  })
})
