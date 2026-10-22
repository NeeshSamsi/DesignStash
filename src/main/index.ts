import { app, session, shell, screen, protocol, net, crashReporter, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APP_ID } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc'
import { createHandlerContext, createPush, type TelemetryRef } from './ipc/context'
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
import { attachLogFile, logger } from './logger'
import { createLogFile } from './log-file'
import { Repository } from './db/repository'
import { createIntegrityService, createStashCheck } from './ipc/integrity'
import { applyPendingStash } from './library/stash-folder-service'
import { createTelemetry, scrubText, type Telemetry } from './telemetry'
import { telemetryBuildConfig } from './telemetry/build-config'
import { noteProcessGone, recentCrashLine, takeNewCrashes } from './telemetry/crash'
import { ProblemReporter } from './telemetry/problem-reporter'
import { TELEMETRY_EVENTS, sizeBucket } from '@shared/telemetry'
import { installAppMenu } from './menu'

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

// Crash dumps are written locally and never uploaded (uploadToServer: false). On the next launch
// a new dump becomes an `app_crashed` event, if the person shares usage data.
crashReporter.start({ uploadToServer: false, submitURL: '' })

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
  // The log file comes first so everything after it is kept. Every line is path-scrubbed on the way in.
  attachLogFile(createLogFile({ dir: join(app.getPath('userData'), 'logs'), scrub: scrubText }))
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

  // Telemetry: NO-OP in dev/test and when consent is off or no key was baked into the build.
  // On by default for a new install; onboarding shows the switch. Nothing is sent until onboarding
  // is complete (spec §13.3a).
  const isTest = process.env.NODE_ENV === 'test'
  const isProd = app.isPackaged
  const { apiKey, host } = telemetryBuildConfig() // baked in at build time, absent in dev/CI -> Noop
  const buildTelemetry = (): Telemetry =>
    createTelemetry({
      enabled: settings.get().telemetryEnabled && settings.get().onboarded,
      isProd,
      isTest,
      installId: settings.get().telemetryInstallId,
      apiKey,
      host
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

  // Problem reports go out whether or not usage data is on: the person presses Send after seeing
  // exactly what is sent. Same build-time key, same production-only rule.
  const userData = app.getPath('userData')
  const crashState = join(userData, 'crash-state.json')
  const reporter = new ProblemReporter({
    apiKey: isProd && !isTest ? apiKey : undefined,
    host,
    installId: settings.get().telemetryInstallId,
    queueFile: join(userData, 'pending-reports.json')
  })
  void reporter.flushQueued().catch(() => {})

  // A renderer or helper process that died is noted, so the next launch can name the crash.
  app.on('render-process-gone', (_e, _wc, details) => {
    logger.error(`Renderer process gone: ${details.reason}`)
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') noteProcessGone(crashState, 'renderer')
  })
  app.on('child-process-gone', (_e, details) => {
    logger.error(`${details.type} process gone: ${details.reason}`)
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') noteProcessGone(crashState, details.type)
  })
  for (const crash of takeNewCrashes({ dumpsDir: app.getPath('crashDumps'), stateFile: crashState })) {
    logger.error(`A crash from the last run was found (${crash.type})`)
    telemetry.track(TELEMETRY_EVENTS.APP_CRASHED, { process_type: crash.type, version: app.getVersion() })
  }

  telemetry.track(TELEMETRY_EVENTS.APP_OPENED, {
    version: app.getVersion(),
    library_size_bucket: libraryOpen ? sizeBucket(new Repository(getDb()).library.getLibraryStats().total) : 'unavailable'
  })

  // Crash capture — captureError scrubs absolute paths before any dispatch.
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err)
    telemetry.captureError(err)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason)
    telemetry.captureError(reason)
  })

  openWindow()
  // Menu items reach whichever window is open, through the menu:command push. With every window
  // closed, a menu item brings the window back instead of doing nothing.
  const push = createPush(() => mainWindow)
  installAppMenu({
    send: (command) => {
      if (!mainWindow) openWindow()
      else push(IPC_CHANNELS.MENU_COMMAND, command)
    },
    openExternal: (url) => void shell.openExternal(url),
    dev: !app.isPackaged
  })
  const repo = libraryOpen ? new Repository(getDb()) : null
  // The screens before the app (launch error, onboarding) run on this set, so it is registered
  // whether or not the library opened. The library domains come on top of it, never instead.
  registerPreAppHandlers({
    settings,
    repo,
    reporter,
    crashLine: () => recentCrashLine(crashState)
  })
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

// Quitting waits briefly for PostHog to send what it holds, then quits for real.
let flushedTelemetry = false
app.on('will-quit', (event) => {
  logger.info('Closing database connection…')
  closeDb()
  if (flushedTelemetry || !telemetryRef) return
  flushedTelemetry = true
  event.preventDefault()
  const flush = telemetryRef.get().shutdown().catch(() => {})
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
  void Promise.race([flush, timeout]).finally(() => app.quit())
})
