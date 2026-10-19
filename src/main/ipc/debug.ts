import { app } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { IPC_CHANNELS } from '@shared/ipc'
import { closeDb } from '../db/connection'
import type { SettingsStore } from '../settings'
import { registerIpcHandler } from './register'

/** Dev-only; the caller skips this in packaged builds. */
export function registerDebugHandlers(settings: SettingsStore): void {
  registerIpcHandler(IPC_CHANNELS.DEBUG_READ_SETTINGS, async () => {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    try {
      const text = await fs.readFile(settingsPath, 'utf-8')
      return { path: settingsPath, json: text, exists: true }
    } catch {
      return { path: settingsPath, json: '{}', exists: false }
    }
  })

  registerIpcHandler(IPC_CHANNELS.DEBUG_RESET_APP, async () => {
    closeDb()
    const userData = app.getPath('userData')
    const home = app.getPath('home')
    const libraryRoot = settings.getLibraryRoot()
    const modelsDir = join(libraryRoot, '..', 'models')

    for (const p of [userData, libraryRoot]) {
      if (!p || p === home || p === '/' || p.split('/').filter(Boolean).length < 2) {
        throw new Error(`refusing unsafe path: ${p}`)
      }
    }

    const ARTIFACTS = ['designstash.db', 'designstash.db-shm', 'designstash.db-wal', 'config.json', 'mockups', 'models']
    await Promise.all([
      ...ARTIFACTS.map((a) => fs.rm(join(libraryRoot, a), { recursive: true, force: true })),
      fs.rm(modelsDir, { recursive: true, force: true }),
      fs.rm(join(userData, 'settings.json'), { recursive: true, force: true }),
      fs.rm(join(userData, 'Library'), { recursive: true, force: true }),
      fs.rm(join(userData, 'models'), { recursive: true, force: true }),
    ])

    app.relaunch()
    app.exit(0)
    return { ok: true }
  })
}
