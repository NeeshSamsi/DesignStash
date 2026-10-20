import { app, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerIpcHandler } from './register'

/** Restart so a new stash folder takes effect. The reply goes out first. */
function defaultRelaunch(): void {
  app.relaunch()
  app.exit(0)
}

/** Reload the window: the crash screen's Reload. */
function defaultReload(): void {
  BrowserWindow.getAllWindows()[0]?.webContents.reload()
}

export function registerAppHandlers(
  relaunch: () => void = defaultRelaunch,
  reload: () => void = defaultReload,
  quit: () => void = () => app.quit()
): void {
  registerIpcHandler(IPC_CHANNELS.APP_INFO, () => ({
    name: 'DesignStash',
    version: app.getVersion(),
    env: process.env.NODE_ENV === 'development' ? 'development' : 'production'
  }))

  registerIpcHandler(IPC_CHANNELS.APP_RELAUNCH, () => {
    setTimeout(relaunch, 100)
    return { relaunching: true }
  })

  // The reply goes out first, as for relaunch.
  registerIpcHandler(IPC_CHANNELS.APP_RELOAD, () => {
    setTimeout(reload, 100)
    return { reloading: true }
  })

  registerIpcHandler(IPC_CHANNELS.APP_QUIT, () => {
    setTimeout(quit, 100)
    return { quitting: true }
  })

}
