import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APP_ID } from '@shared/constants'
import { createHandlerContext, type TelemetryRef } from './ipc/context'
import { registerAllHandlers } from './ipc'
import { initDb, getDb, closeDb } from './db/connection'
import { runMigrations } from './db/migrate'
import { bootstrapLibrary, seedTaxonomy } from './db/bootstrap'
import { ensureSearchIndex } from './db/search-index'
import { createSettingsStore } from './settings'
import { logger } from './logger'
import { Repository } from './db/repository'
import { IntegrityService } from './library/integrity-service'
import { applyPendingStash } from './library/stash-folder-service'
import { createTelemetry, type Telemetry } from './telemetry'

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

// Module-scoped so the will-quit handler can flush telemetry on shutdown.
let telemetryRef: TelemetryRef | null = null

function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(app.getAppPath(), 'drizzle')
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
  // A stash folder chosen last time takes effect now, before the database opens.
  applyPendingStash(settings)

  try {
    logger.info('Initializing application data…')
    const libraryRoot = settings.getLibraryRoot()
    bootstrapLibrary(libraryRoot)
    const db = initDb(join(libraryRoot, 'designstash.db'))
    runMigrations(db, migrationsFolder())
    ensureSearchIndex(db)
    seedTaxonomy(db)
    try {
      new Repository(db).rebuildSearchIndex()
    } catch (err) {
      logger.error('Search index rebuild failed:', err)
    }
    // Detection-only launch scan — never auto-resolves, never blocks startup.
    void (async () => {
      try {
        const report = await new IntegrityService(new Repository(db), libraryRoot).scan()
        logger.info(
          `integrity: ${report.orphanFiles.length} orphan files, ${report.orphanRecords.length} orphan records`
        )
      } catch (err) {
        logger.error('Integrity launch scan failed:', err)
      }
    })()
    logger.info(`Database and library initialized at ${libraryRoot}`)
  } catch (err) {
    logger.error('Failed to initialize database/library:', err)
  }

  // Telemetry: NO-OP in dev/test and when consent is off or no key is set.
  // Nothing is sent until onboarding is complete (spec §13.3a).
  const isTest = process.env.NODE_ENV === 'test'
  const isProd = app.isPackaged
  const apiKey = process.env.POSTHOG_KEY // absent in dev/CI -> Noop
  const buildTelemetry = (): Telemetry =>
    createTelemetry({
      enabled: settings.get().telemetryEnabled && settings.get().onboarded,
      isProd,
      isTest,
      installId: settings.get().telemetryInstallId,
      apiKey
    })
  let telemetry = buildTelemetry()
  telemetryRef = {
    get: () => telemetry,
    rebuild: () => {
      const prev = telemetry
      telemetry = buildTelemetry()
      void prev.shutdown()
    }
  }

  // Crash capture — captureError scrubs absolute paths before any dispatch.
  process.on('uncaughtException', (err) => telemetry.captureError(err))
  process.on('unhandledRejection', (reason) => telemetry.captureError(reason))

  const window = createWindow()
  registerAllHandlers(
    createHandlerContext({ settings, telemetry: telemetryRef, repo: new Repository(getDb()), window })
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  logger.info('Closing database connection…')
  void telemetryRef?.get().shutdown()
  closeDb()
})
