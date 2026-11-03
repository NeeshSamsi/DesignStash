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

import { registerAppHandlers } from './app'

const call = async <T>(channel: string): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, undefined)) as IpcResult<T>

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
