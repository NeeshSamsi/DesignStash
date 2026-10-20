import { app } from 'electron'
import { sql } from 'drizzle-orm'
import { IPC_CHANNELS } from '@shared/ipc'
import { getDb } from '../db/connection'
import { tagCategories } from '../db/schema'
import { registerIpcHandler } from './register'

/** Restart so a new stash folder takes effect. The reply goes out first. */
function defaultRelaunch(): void {
  app.relaunch()
  app.exit(0)
}

export function registerAppHandlers(relaunch: () => void = defaultRelaunch): void {
  registerIpcHandler(IPC_CHANNELS.APP_INFO, () => ({
    name: 'DesignStash',
    version: app.getVersion(),
    env: process.env.NODE_ENV === 'development' ? 'development' : 'production'
  }))

  registerIpcHandler(IPC_CHANNELS.APP_RELAUNCH, () => {
    setTimeout(relaunch, 100)
    return { relaunching: true }
  })

  registerIpcHandler(IPC_CHANNELS.DB_PING, () => {
    const db = getDb()
    const row = db.select({ categories: sql<number>`count(*)` }).from(tagCategories).get()
    return {
      success: true,
      message: `pong — ${row?.categories ?? 0} tag categories seeded`,
      timestamp: Date.now()
    }
  })
}
