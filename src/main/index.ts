import { app, session, shell, screen, protocol, net, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APP_ID } from '@shared/constants'
import { createHandlerContext, type TelemetryRef } from './ipc/context'
import { registerAllHandlers, registerPreAppHandlers } from './ipc'
import { initDb, getDb, closeDb } from './db/connection'
import { runMigrations } from './db/migrate'
import { bootstrapLibrary, seedTaxonomy } from './db/bootstrap'
import { ensureSearchIndex } from './db/search-index'
import { createSettingsStore } from './settings'
import { isLibraryOpen, runBoot, setBootStatus } from './boot-status'
import { MIN_WINDOW, windowSizeOptions } from './window-size'
import { applyCsp } from './csp'
import { handleCoverRequests, registerCoverScheme } from './cover-protocol'
import { logger } from './logger'
import { Repository } from './db/repository'
import { createIntegrityService, createStashCheck } from './ipc/integrity'
import { applyPendingStash } from './library/stash-folder-service'
import { createTelemetry, type Telemetry } from './telemetry'

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

// Covers are served through their own scheme (see shared/cover-url.ts). It has to be declared before ready.
registerCoverScheme(protocol)

// Module-scoped so the will-quit handler can flush telemetry on shutdown.
let telemetryRef: TelemetryRef | null = null

function migrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

// The one window. Pushes go to whatever this holds; it is cleared when the window closes, and
// macOS can open a new one later while the handlers stay registered.
let mainWindow: BrowserWindow | null = null

function openWindow(): BrowserWindow {
  // 1440×900 clamped to the display, resizable down to a minimum, centred on first launch.
  const window = new BrowserWindow({
    ...windowSizeOptions(screen.getPrimaryDisplay().workAreaSize),
    center: true,
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

  // Whatever size the window was given, it can never be resized below the minimum.
  window.setMinimumSize(MIN_WINDOW.width, MIN_WINDOW.height)

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow = window
  return window
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)
  // Dev gets its policy as a header (it must allow Vite's HMR); the packaged build carries it as a
  // meta tag in index.html, because headers are not reliable for file:// pages.
  if (rendererDevUrl) applyCsp(session.defaultSession, { devUrl: rendererDevUrl })

  const settings = createSettingsStore(app.getPath('userData'))
  handleCoverRequests(
    protocol,
    (fileUrl) => net.fetch(fileUrl),
    () => settings.getLibraryRoot()
  )
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
        new Repository(db).search.rebuildSearchIndex()
      } catch (err) {
        logger.error('Search index rebuild failed:', err)
      }
    },
    (err) => logger.error('Failed to initialize database/library:', err)
  )
  setBootStatus(boot)
  // A library that did not open leaves nothing for the other handlers to run on: the window
  // only gets the launch status, so it can say what happened.
  const libraryOpen = isLibraryOpen(boot)
  logger.info(`Launch status: ${boot.state}`)

  if (libraryOpen) {
    const db = getDb()
    // Detection-only launch scan — never auto-resolves, never blocks startup.
    void (async () => {
      try {
        const integrity = createIntegrityService(new Repository(db), settings)
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

  openWindow()
  const repo = libraryOpen ? new Repository(getDb()) : null
  // The screens before the app (launch error, onboarding) run on this set, so it is registered
  // whether or not the library opened. The library domains come on top of it, never instead.
  registerPreAppHandlers({ settings, repo })
  if (repo) {
    registerAllHandlers(
      createHandlerContext({
        settings,
        telemetry: telemetryRef,
        repo,
        getWindow: () => mainWindow
      })
    )
  }

  app.on('activate', () => {
    if (!mainWindow) openWindow()
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
