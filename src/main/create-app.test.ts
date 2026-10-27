import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { getBootStatus, setBootStatus } from './boot-status'
import { CRASH_DIALOG, createApp, type AppDeps, type LaunchServices, type LaunchSteps } from './create-app'

class FakeWebContents extends EventEmitter {
  reload = vi.fn()
  send = vi.fn()
  openHandler: ((details: { url: string }) => { action: string }) | null = null
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }): void {
    this.openHandler = handler
  }
  isDestroyed = (): boolean => false
}

class FakeWindow extends EventEmitter {
  webContents = new FakeWebContents()
  destroyed = false
  minimized = false
  loadURL = vi.fn(async () => {})
  loadFile = vi.fn(async () => {})
  setMinimumSize = vi.fn()
  show = vi.fn()
  focus = vi.fn()
  restore = vi.fn()
  constructor(readonly options: BrowserWindowConstructorOptions) {
    super()
  }
  isMinimized = (): boolean => this.minimized
  isDestroyed = (): boolean => this.destroyed
  close(): void {
    this.destroyed = true
    this.emit('closed')
  }
}

class FakeApp extends EventEmitter {
  lock = true
  userData = ''
  requestSingleInstanceLock = vi.fn(() => this.lock)
  whenReady = vi.fn(() => Promise.resolve())
  quit = vi.fn()
  exit = vi.fn()
  setAppUserModelId = vi.fn()
  getPath = vi.fn((name: string) => (name === 'userData' ? this.userData : tmpdir()))
}

let userData: string
let app: FakeApp
let windows: FakeWindow[]
let processHandlers: Map<string, (arg: unknown) => void>
let calls: string[]
let telemetry: { captureError: Mock<(err: unknown) => void>; shutdown: Mock<() => Promise<void>> }
let steps: { [K in keyof LaunchSteps]: ReturnType<typeof vi.fn> }
let deps: AppDeps

/** Lets `whenReady().then(...)` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Launches and waits for the window. */
async function launch(): Promise<void> {
  createApp(deps)
  await settle()
}

const lastWindow = (): FakeWindow => windows[windows.length - 1]!

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  userData = mkdtempSync(join(tmpdir(), 'ds-create-app-'))
  app = new FakeApp()
  app.userData = userData
  windows = []
  calls = []
  processHandlers = new Map()
  telemetry = { captureError: vi.fn<(err: unknown) => void>(), shutdown: vi.fn(async () => {}) }
  const services: LaunchServices = {
    telemetry: { get: () => ({ track: vi.fn(), ...telemetry }), rebuild: vi.fn() },
    reporter: { send: vi.fn() },
    crashLine: () => 'none in the last 7 days'
  }
  const step = (name: string, impl: (...args: unknown[]) => unknown = () => undefined) =>
    vi.fn((...args: unknown[]) => {
      calls.push(name)
      return impl(...args)
    })
  steps = {
    prepare: step('prepare'),
    applyPendingStash: step('applyPendingStash'),
    openLibrary: step('openLibrary'),
    startServices: step('startServices', () => services),
    registerPreAppHandlers: step('registerPreAppHandlers'),
    registerLibraryHandlers: step('registerLibraryHandlers'),
    installMenu: step('installMenu'),
    closeLibrary: step('closeLibrary')
  }
  deps = {
    app: app as unknown as AppDeps['app'],
    process: {
      platform: 'darwin',
      on: ((event: string, handler: (arg: unknown) => void) => {
        processHandlers.set(event, handler)
      }) as unknown as AppDeps['process']['on']
    },
    createWindow: (options) => {
      calls.push('createWindow')
      const window = new FakeWindow(options)
      windows.push(window)
      return window as unknown as BrowserWindow
    },
    workArea: () => ({ width: 1728, height: 1080 }),
    openExternal: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
    page: { file: '/Applications/DesignStash.app/Contents/Resources/app/out/renderer/index.html' },
    preload: '/app/out/preload/index.js',
    steps: steps as unknown as LaunchSteps
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  setBootStatus({ state: 'ok' })
  chmodSync(userData, 0o700)
  rmSync(userData, { recursive: true, force: true })
})

describe('one instance', () => {
  it('a second launch hands over to the running one and starts nothing', async () => {
    app.lock = false
    await launch()
    expect(app.quit).toHaveBeenCalled()
    expect(app.whenReady).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('a second launch brings the running window forward', async () => {
    await launch()
    lastWindow().minimized = true
    app.emit('second-instance')
    expect(lastWindow().restore).toHaveBeenCalled()
    expect(lastWindow().focus).toHaveBeenCalled()
    expect(windows).toHaveLength(1)
  })

  it('a second launch with every window closed opens one', async () => {
    await launch()
    lastWindow().close()
    app.emit('second-instance')
    expect(windows).toHaveLength(2)
  })
})

describe('launch', () => {
  it('opens the library, then the services and handlers, then the window', async () => {
    await launch()
    expect(calls).toEqual([
      'prepare',
      'applyPendingStash',
      'openLibrary',
      'startServices',
      'registerPreAppHandlers',
      'registerLibraryHandlers',
      'createWindow',
      'installMenu'
    ])
    expect(getBootStatus()).toEqual({ state: 'ok' })
  })

  it('a library that fails to open shows the launch error, with only the pre-app handlers', async () => {
    steps.openLibrary.mockImplementation(() => {
      throw new Error('database disk image is malformed')
    })
    await launch()
    expect(getBootStatus()).toEqual({ state: 'library-failed' })
    expect(steps.registerPreAppHandlers).toHaveBeenCalled()
    expect(steps.registerLibraryHandlers).not.toHaveBeenCalled()
    expect(windows).toHaveLength(1)
  })

  it('app data it cannot write still opens the window, on the launch error', async () => {
    chmodSync(userData, 0o500)
    await launch()
    expect(getBootStatus()).toEqual({ state: 'library-failed' })
    expect(steps.registerPreAppHandlers).toHaveBeenCalled()
    expect(steps.registerLibraryHandlers).not.toHaveBeenCalled()
    expect(windows).toHaveLength(1)
  })

  it('a throw while starting the services still opens the window, on the launch error', async () => {
    steps.startServices.mockImplementation(() => {
      throw new Error('crash state unreadable')
    })
    await launch()
    expect(getBootStatus()).toEqual({ state: 'library-failed' })
    expect(steps.registerPreAppHandlers).toHaveBeenCalledWith(expect.anything(), null, false)
    expect(windows).toHaveLength(1)
  })

  it('a throw while registering the library handlers still opens the window, on the launch error', async () => {
    steps.registerLibraryHandlers.mockImplementation(() => {
      throw new Error('helper missing')
    })
    await launch()
    expect(getBootStatus()).toEqual({ state: 'library-failed' })
    expect(windows).toHaveLength(1)
  })

  it('a throw nobody caught is logged and reported', async () => {
    await launch()
    const err = new Error('late')
    processHandlers.get('uncaughtException')!(err)
    expect(telemetry.captureError).toHaveBeenCalledWith(err)
  })
})

describe('the window', () => {
  it('is sandboxed and opens at its first-launch size', async () => {
    await launch()
    expect(lastWindow().options).toMatchObject({
      width: 1440,
      height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    expect(lastWindow().setMinimumSize).toHaveBeenCalledWith(1088, 680)
  })

  it('a dead renderer reloads the page once', async () => {
    await launch()
    lastWindow().webContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: 1 })
    expect(lastWindow().webContents.reload).toHaveBeenCalledTimes(1)
    expect(deps.showMessageBox).not.toHaveBeenCalled()
  })

  it('a second crash asks before reloading, and Quit quits', async () => {
    await launch()
    vi.mocked(deps.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false })
    const { webContents } = lastWindow()
    webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    await settle()
    expect(deps.showMessageBox).toHaveBeenCalledWith(lastWindow(), CRASH_DIALOG)
    expect(webContents.reload).toHaveBeenCalledTimes(1)
    expect(app.quit).toHaveBeenCalled()
  })

  it('a second crash reloads again when the person picks Reload', async () => {
    await launch()
    const { webContents } = lastWindow()
    webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    await settle()
    expect(webContents.reload).toHaveBeenCalledTimes(2)
  })

  it('a renderer that exits or is killed while closing is left alone', async () => {
    await launch()
    lastWindow().webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 })
    lastWindow().webContents.emit('render-process-gone', {}, { reason: 'killed', exitCode: 15 })
    expect(lastWindow().webContents.reload).not.toHaveBeenCalled()
    expect(deps.showMessageBox).not.toHaveBeenCalled()
  })

  it('opens web links in the browser and nothing else', async () => {
    await launch()
    const open = lastWindow().webContents.openHandler!
    for (const url of [
      'https://github.com/designstash/releases',
      'file:///Users/neesh/Desktop/kit.psd',
      'http://example.com',
      'javascript:alert(1)',
      'x-apple.systempreferences:com.apple.preference'
    ]) {
      expect(open({ url })).toEqual({ action: 'deny' })
    }
    expect(deps.openExternal).toHaveBeenCalledTimes(1)
    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/designstash/releases')
  })

  it('never navigates away from the app page', async () => {
    await launch()
    const navigate = (url: string): boolean => {
      const event = { url, preventDefault: vi.fn() }
      lastWindow().webContents.emit('will-navigate', event)
      return event.preventDefault.mock.calls.length === 0
    }
    expect(navigate('file:///Users/neesh/Desktop/kit.psd')).toBe(false)
    expect(navigate('https://example.com')).toBe(false)
    expect(
      navigate('file:///Applications/DesignStash.app/Contents/Resources/app/out/renderer/index.html#top')
    ).toBe(true)
  })

  it('in dev, stays on the dev server page', async () => {
    deps.page = { url: 'http://localhost:5173' }
    await launch()
    const event = { url: 'http://localhost:4000/', preventDefault: vi.fn() }
    lastWindow().webContents.emit('will-navigate', event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(lastWindow().loadURL).toHaveBeenCalledWith('http://localhost:5173')
  })

  it('comes back from the Dock after it was closed', async () => {
    await launch()
    lastWindow().close()
    app.emit('activate')
    expect(windows).toHaveLength(2)
  })

  it('menu items reach the open window', async () => {
    await launch()
    const send = steps.installMenu.mock.calls[0]![0] as (command: string) => void
    send('settings')
    expect(lastWindow().webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.MENU_COMMAND, 'settings')
  })
})

describe('quitting', () => {
  it('closes the library and waits for telemetry before exiting', async () => {
    await launch()
    const event = { preventDefault: vi.fn() }
    app.emit('will-quit', event)
    expect(steps.closeLibrary).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
    await settle()
    expect(telemetry.shutdown).toHaveBeenCalled()
    expect(app.exit).toHaveBeenCalledWith(0)
  })
})
