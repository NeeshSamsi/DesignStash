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
import { runBoot, setBootStatus } from './boot-status'
import { registerAppHandlers } from './ipc/app'
import { registerBootHandlers } from './ipc/boot'
import { logger } from './logger'
import { Repository } from './db/repository'
import { IntegrityService } from './library/integrity-service'
import { createStashCheck } from './ipc/integrity'
import { applyPendingStash } from './library/stash-folder-service'
import { createTelemetry, type Telemetry } from './telemetry'

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

// Module-scoped so the will-quit handler can flush telemetry on shutdown.
let telemetryRef: TelemetryRef | null = null

function migrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
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

  const libraryRoot = settings.getLibraryRoot()
  logger.info('Initializing application data…')
  const boot = runBoot(
    settings,
    () => {
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
    },
    (err) => logger.error('Failed to initialize database/library:', err)
  )
  setBootStatus(boot)
  // A library that did not open leaves nothing for the other handlers to run on: the window
  // only gets the launch status, so it can say what happened.
  const libraryOpen = boot.state === 'ok' || boot.state === 'settings-corrupt'
  logger.info(`Launch status: ${boot.state}`)

  if (libraryOpen) {
    const db = getDb()
    // Detection-only launch scan — never auto-resolves, never blocks startup.
    void (async () => {
      try {
        const integrity = new IntegrityService(new Repository(db), libraryRoot)
        const { lastRun } = await createStashCheck(settings, integrity).run('launch')
        logger.info(`integrity: launch check ${lastRun?.result}, ${lastRun?.toReview} to review`)
      } catch (err) {
        logger.error('Integrity launch scan failed:', err)
      }
    })()
    logger.info(`Database and library initialized at ${libraryRoot}`)
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
  if (libraryOpen) {
    registerAllHandlers(
      createHandlerContext({
        settings,
        telemetry: telemetryRef,
        repo: new Repository(getDb()),
        window
      })
    )
  } else {
    registerAppHandlers()
    registerBootHandlers()
  }

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
