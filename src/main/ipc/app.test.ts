import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn(), quit: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { logger } from '../logger'
import { registerAppHandlers, registerRendererErrorHandler } from './app'

const call = async <T>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  vi.useFakeTimers()
})

describe('crash screen channels', () => {
  it('APP_RELOAD replies first, then reloads the window', async () => {
    const reload = vi.fn()
    registerAppHandlers(vi.fn(), reload, vi.fn())
    expect(await call(IPC_CHANNELS.APP_RELOAD)).toEqual({
      success: true,
      data: { reloading: true }
    })
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('APP_QUIT replies first, then quits', async () => {
    const quit = vi.fn()
    registerAppHandlers(vi.fn(), vi.fn(), quit)
    expect(await call(IPC_CHANNELS.APP_QUIT)).toEqual({ success: true, data: { quitting: true } })
    expect(quit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(quit).toHaveBeenCalledOnce()
  })
})

describe('renderer errors', () => {
  const report = {
    source: 'render',
    name: 'TypeError',
    message: 'boom',
    stack: 'TypeError: boom\n    at Card (card.tsx:1:1)',
    componentStack: '\n    at Card\n    at Grid'
  }

  it('logs a crash in the window with its component stack, and sends it as an exception', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const captureError = vi.fn()
    registerRendererErrorHandler({ get: () => ({ captureError }) })

    expect(await call(IPC_CHANNELS.APP_RENDERER_ERROR, report)).toEqual({
      success: true,
      data: undefined
    })

    expect(log).toHaveBeenCalledOnce()
    const [line, error] = log.mock.calls[0]!
    expect(line).toContain('crashed')
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).stack).toContain('at Card (card.tsx:1:1)')
    expect((error as Error).stack).toContain('at Grid')
    expect(captureError).toHaveBeenCalledOnce()
    const [sent, context] = captureError.mock.calls[0]!
    expect(sent).toBe(error)
    expect((sent as Error).name).toBe('TypeError')
    expect((sent as Error).message).toBe('boom')
    expect(context).toEqual({ source: 'renderer-render' })
    log.mockRestore()
  })

  it('still logs when telemetry has not started', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    registerRendererErrorHandler(null)
    await call(IPC_CHANNELS.APP_RENDERER_ERROR, {
      source: 'rejection',
      name: 'Error',
      message: 'nope'
    })
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]![0]).toContain('unhandled rejection')
    expect((log.mock.calls[0]![1] as Error).stack).toContain('Error: nope')
    log.mockRestore()
  })

  it('refuses a report that is not one', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    registerRendererErrorHandler(null)
    const res = await call(IPC_CHANNELS.APP_RENDERER_ERROR, { source: 'elsewhere' })
    expect(res.success).toBe(false)
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
