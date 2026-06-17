import { app, shell, dialog, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { APP_ID } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerIpcHandler } from './ipc'
import { initDb, getDb, closeDb } from './db/connection'
import { runMigrations } from './db/migrate'
import { bootstrapLibrary, seedTaxonomy } from './db/bootstrap'
import { tagCategories } from './db/schema'
import { createSettingsStore, type SettingsStore } from './settings'
import { logger } from './logger'
import { ImportService } from './import/import-service'
import { Repository } from './db/repository'

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(app.getAppPath(), 'drizzle')
}

function registerHandlers(settings: SettingsStore, window: BrowserWindow): void {
  const repo = new Repository(getDb())
  const importService = new ImportService(repo, settings.getLibraryRoot())
  const activeImports = new Map<string, AbortController>()

  registerIpcHandler(IPC_CHANNELS.APP_INFO, () => ({
    name: 'DesignStash',
    version: app.getVersion(),
    env: process.env.NODE_ENV === 'development' ? 'development' : 'production'
  }))

  registerIpcHandler(IPC_CHANNELS.DB_PING, () => {
    const db = getDb()
    const row = db.select({ categories: sql<number>`count(*)` }).from(tagCategories).get()
    return {
      success: true,
      message: `pong — ${row?.categories ?? 0} tag categories seeded`,
      timestamp: Date.now()
    }
  })

  // Library location is a setting (default <userData>/Library); onboarding can override it.
  registerIpcHandler(IPC_CHANNELS.SETTINGS_GET, () => settings.get())

  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, (args) => {
    // Persists the choice. Relocating an existing library + re-init applies on next launch
    // (full move/restart handled when onboarding lands).
    const next = settings.update({ libraryRoot: args.path })
    return { libraryRoot: next.libraryRoot }
  })

  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return { path }
  })

  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PSD Files', extensions: ['psd'] }]
    })
    return { paths: result.filePaths }
  })

  registerIpcHandler(IPC_CHANNELS.IMPORT_START, async (args) => {
    const batchId = randomUUID()
    const controller = new AbortController()
    activeImports.set(batchId, controller)

    try {
      const summary = await importService.importPaths(args.paths, {
        batchId,
        signal: controller.signal,
        onProgress: (progress) => {
          window.webContents.send(IPC_CHANNELS.IMPORT_PROGRESS, progress)
        }
      })
      return summary
    } finally {
      activeImports.delete(batchId)
    }
  })

  registerIpcHandler(IPC_CHANNELS.IMPORT_CANCEL, (args) => {
    const controller = activeImports.get(args.batchId)
    if (controller) {
      controller.abort()
      activeImports.delete(args.batchId)
      return { cancelled: true }
    }
    return { cancelled: false }
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)

  const settings = createSettingsStore(app.getPath('userData'))

  try {
    logger.info('Initializing application data…')
    const libraryRoot = settings.getLibraryRoot()
    bootstrapLibrary(libraryRoot)
    const db = initDb(join(libraryRoot, 'designstash.db'))
    runMigrations(db, migrationsFolder())
    seedTaxonomy(db)
    logger.info(`Database and library initialized at ${libraryRoot}`)
  } catch (err) {
    logger.error('Failed to initialize database/library:', err)
  }

  const window = createWindow()
  registerHandlers(settings, window)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  logger.info('Closing database connection…')
  closeDb()
})
