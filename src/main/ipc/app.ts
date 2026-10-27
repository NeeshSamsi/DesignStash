import { app, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { RendererErrorReport } from '@shared/ipc/app'
import { logger } from '../logger'
import type { Telemetry } from '../telemetry'
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

const RENDERER_ERROR_WORDS: Record<RendererErrorReport['source'], string> = {
  render: 'crashed',
  error: 'uncaught error',
  rejection: 'unhandled rejection'
}

/** The report as an Error, its component stack after the JS stack, so the log and telemetry both carry it. */
function rendererError(report: RendererErrorReport): Error {
  const error = new Error(report.message)
  error.name = report.name
  error.stack = [report.stack ?? `${report.name}: ${report.message}`, report.componentStack]
    .filter((part) => part !== undefined && part.trim() !== '')
    .join('\n')
  return error
}

/**
 * Errors from the window reach the log file, and so a problem report, and with consent go out as
 * an exception. `telemetry` is null when launch failed before telemetry started; the log still
 * gets them. The log file and captureError each scrub paths.
 */
export function registerRendererErrorHandler(
  telemetry: { get(): Pick<Telemetry, 'captureError'> } | null
): void {
  registerIpcHandler(IPC_CHANNELS.APP_RENDERER_ERROR, (report) => {
    const error = rendererError(report)
    logger.error(`[renderer] ${RENDERER_ERROR_WORDS[report.source]}:`, error)
    telemetry?.get().captureError(error, { source: `renderer-${report.source}` })
  })
}
