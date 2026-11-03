import { afterEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { attachLogFile } from '../logger'
import { registerIpcHandler } from './register'

function logLines(): string[] {
  const lines: string[] = []
  attachLogFile({ write: (l) => lines.push(l), tail: () => lines.join('\n') })
  return lines
}

const call = async (channel: string): Promise<IpcResult<unknown>> =>
  (await handlers.get(channel)!(null, undefined)) as IpcResult<unknown>

afterEach(() => {
  attachLogFile(null)
  handlers.clear()
  vi.restoreAllMocks()
})

describe('registerIpcHandler', () => {
  it('writes a handler that throws to the log file, with its channel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const lines = logLines()
    registerIpcHandler(IPC_CHANNELS.APP_INFO, () => {
      throw new Error('disk full')
    })

    const res = await call(IPC_CHANNELS.APP_INFO)

    expect(res).toMatchObject({ success: false, error: { code: 'UNEXPECTED_ERROR' } })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\[ERROR\] .*app:info.*Error: disk full/)
  })

  it('writes a reply that breaks its contract to the log file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const lines = logLines()
    registerIpcHandler(IPC_CHANNELS.APP_INFO, () => ({}) as never)

    const res = await call(IPC_CHANNELS.APP_INFO)

    expect(res).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\[ERROR\] .*app:info/)
  })
})
