import { pathToFileURL } from 'node:url'
import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  MessageBoxOptions,
  MessageBoxReturnValue,
  RenderProcessGoneDetails
} from 'electron'
import { APP_ID } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MenuCommand } from '@shared/ipc/menu'
import { isLibraryOpen, runBoot, setBootStatus } from './boot-status'
import { logger } from './logger'
import { createSettingsStore, type SettingsStore } from './settings'
import { MIN_WINDOW, windowSizeOptions, type Size } from './window-size'
import type { TelemetryRef } from './ipc/context'
import type { ProblemReporter } from './telemetry/problem-reporter'

/** What launch starts beside the library. The handlers use all of it; quitting flushes the telemetry. */
export interface LaunchServices {
  telemetry: TelemetryRef
  reporter: Pick<ProblemReporter, 'send'>
  /** The crash line for a problem report, e.g. "none in the last 7 days". */
  crashLine: () => string
}

/**
 * The launch work that needs the real modules: the log file, the database, telemetry, the IPC
 * handlers, the menu. `createApp` decides the order and what happens when one of them throws.
 */
export interface LaunchSteps {
  /** The log file, the dev CSP and cover requests: in place before anything that can fail. */
  prepare(settings: SettingsStore): void
  /** A stash folder chosen last time takes effect, before the database opens. */
  applyPendingStash(settings: SettingsStore): void
  /** Folders, database, migrations, taxonomy and the search index. Throws when the library can't open. */
  openLibrary(libraryRoot: string): void
  /** The launch scan, telemetry, crash notes and the problem reporter. */
  startServices(settings: SettingsStore, libraryOpen: boolean): LaunchServices
  /** The screens before the app (launch error, onboarding) run on these, so they go in library or not. */
  registerPreAppHandlers(
    settings: SettingsStore,
    services: LaunchServices | null,
    libraryOpen: boolean
  ): void
  /** The library domains, on top of the pre-app set. */
  registerLibraryHandlers(
    settings: SettingsStore,
    services: LaunchServices,
    getWindow: () => BrowserWindow | null
  ): void
  /**
   * The app menu. `send` takes a chosen item; `takePending` answers menu:pending with an item
   * chosen while no window was open, once.
   */
  installMenu(send: (command: MenuCommand) => void, takePending: () => MenuCommand | null): void
  closeLibrary(): void
}

export interface AppDeps {
  app: Pick<
    App,
    'whenReady' | 'requestSingleInstanceLock' | 'on' | 'quit' | 'exit' | 'getPath' | 'setAppUserModelId'
  >
  process: Pick<NodeJS.Process, 'on' | 'platform'>
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow
  /** The primary display minus the menu bar and dock. */
  workArea: () => Size
  openExternal: (url: string) => void
  showMessageBox: (window: BrowserWindow, options: MessageBoxOptions) => Promise<MessageBoxReturnValue>
  /** The dev server's address, or the built index.html. */
  page: { url: string } | { file: string }
  preload: string
  steps: LaunchSteps
}

/** Said in place of the renderer's crash screen when the window dies a second time. */
export const CRASH_DIALOG: MessageBoxOptions = {
  type: 'error',
  message: 'Something went wrong',
  detail: 'DesignStash hit a problem it couldn’t recover from. Your stash is safe. Reload to carry on.',
  buttons: ['Reload', 'Quit'],
  defaultId: 0,
  cancelId: 1
}

/** Only web pages leave the app, in the browser. Files, app schemes and anything else stay shut. */
function isWebPage(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** The app's own page: same scheme, host and path as what was loaded, whatever the hash or query. */
function isSamePage(url: string, own: string): boolean {
  try {
    const a = new URL(url)
    const b = new URL(own)
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname
  } catch {
    return false
  }
}

/**
 * The main process: one instance, one window, the launch order and the lifecycle. Electron and the
 * real launch work come in through `deps`, so tests run it on fakes.
 */
export function createApp(deps: AppDeps): void {
  const { app, steps } = deps

  // A second copy would share the database and settings, and its AI start-up would stop this
  // one's llama-server. It hands over to this one instead.
  if (!app.requestSingleInstanceLock()) {
    logger.info('DesignStash is already running; handing over to it.')
    app.quit()
    return
  }

  // The one window. Pushes go to whatever this holds; it is cleared when the window closes, and
  // macOS can open a new one later while the handlers stay registered.
  let mainWindow: BrowserWindow | null = null
  let services: LaunchServices | null = null
  let ready = false
  const ownPage = 'url' in deps.page ? deps.page.url : pathToFileURL(deps.page.file).href

  function openWindow(): BrowserWindow {
    // 1440×900 clamped to the display, resizable down to a minimum, centred on first launch.
    const window = deps.createWindow({
      ...windowSizeOptions(deps.workArea()),
      center: true,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: deps.preload,
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
      if (isWebPage(url)) deps.openExternal(url)
      return { action: 'deny' }
    })
    // A link or a stray drop never replaces the app with another page.
    window.webContents.on('will-navigate', (event) => {
      if (!isSamePage(event.url, ownPage)) event.preventDefault()
    })

    // A renderer that died leaves a blank window. The first time it reloads, so the launch screens
    // run again; after that the person chooses, so a page that keeps crashing can't loop. A clean
    // exit or a kill is a shutdown (the crash notes skip them too), so those are left alone.
    let reloaded = false
    window.webContents.on('render-process-gone', (_event, details: RenderProcessGoneDetails) => {
      if (details.reason === 'clean-exit' || details.reason === 'killed' || window.isDestroyed())
        return
      if (!reloaded) {
        reloaded = true
        window.webContents.reload()
        return
      }
      void deps.showMessageBox(window, CRASH_DIALOG).then(({ response }) => {
        if (response === 1) app.quit()
        else if (!window.isDestroyed()) window.webContents.reload()
      })
    })

    if ('url' in deps.page) void window.loadURL(deps.page.url)
    else void window.loadFile(deps.page.file)
    mainWindow = window
    return window
  }

  /** Brings the window forward, or opens one when every window was closed. */
  function showWindow(): void {
    if (!mainWindow) {
      openWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  app.on('second-instance', () => {
    if (ready) showWindow()
  })

  // Crash capture: in place before launch starts, so a throw anywhere in it is logged.
  // captureError scrubs absolute paths before any dispatch.
  deps.process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err)
    services?.telemetry.get().captureError(err)
  })
  deps.process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason)
    services?.telemetry.get().captureError(reason)
  })

  /**
   * Settings, the library and the services, then the handlers. A throw anywhere leaves the launch
   * status at `library-failed`, so the window still opens and says what happened.
   */
  function launch(settings: SettingsStore): void {
    let libraryOpen: boolean
    try {
      steps.prepare(settings)
      steps.applyPendingStash(settings)
      logger.info('Initializing application data…')
      const boot = runBoot(
        settings,
        () => steps.openLibrary(settings.getLibraryRoot()),
        (err) => logger.error('Failed to initialize database/library:', err)
      )
      setBootStatus(boot)
      // A library that did not open leaves nothing for the other handlers to run on: the window
      // only gets the launch status, so it can say what happened.
      libraryOpen = isLibraryOpen(boot)
      logger.info(`Launch status: ${boot.state}`)
      services = steps.startServices(settings, libraryOpen)
    } catch (err) {
      logger.error('Launch failed:', err)
      setBootStatus({ state: 'library-failed' })
      libraryOpen = false
    }

    try {
      steps.registerPreAppHandlers(settings, services, libraryOpen)
      if (libraryOpen && services) {
        steps.registerLibraryHandlers(settings, services, () => mainWindow)
      }
    } catch (err) {
      logger.error('Registering the handlers failed:', err)
      setBootStatus({ state: 'library-failed' })
    }
  }

  void app.whenReady().then(() => {
    ready = true
    app.setAppUserModelId(APP_ID)
    launch(createSettingsStore(app.getPath('userData')))

    openWindow()
    // Menu items reach whichever window is open, through the menu:command push. With every window
    // closed, a menu item brings the window back and waits for it: the window asks for it once it
    // listens (menu:pending), since a push sent while it loads would reach no one.
    let pendingMenu: MenuCommand | null = null
    steps.installMenu(
      (command) => {
        if (!mainWindow) {
          pendingMenu = command
          openWindow()
        } else if (!mainWindow.isDestroyed())
          mainWindow.webContents.send(IPC_CHANNELS.MENU_COMMAND, command)
      },
      () => {
        const command = pendingMenu
        pendingMenu = null
        return command
      }
    )

    app.on('activate', () => {
      if (!mainWindow) openWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (deps.process.platform !== 'darwin') app.quit()
  })

  // Quitting waits briefly for PostHog to send what it holds, then exits. A second app.quit() would
  // not raise will-quit again, so the process ends with app.exit once the flush settles.
  let flushedTelemetry = false
  app.on('will-quit', (event) => {
    logger.info('Closing database connection…')
    steps.closeLibrary()
    if (flushedTelemetry || !services) return
    flushedTelemetry = true
    event.preventDefault()
    const flush = services.telemetry
      .get()
      .shutdown()
      .catch(() => {})
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
    void Promise.race([flush, timeout]).finally(() => app.exit(0))
  })
}
