import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { createTestDb } from '../db/repositories/__tests__/setup'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { registerLibraryHandlers } from './library'

let sqlite: Database.Database
let repo: Repository
let track: ReturnType<typeof vi.fn>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  track = vi.fn()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  registerLibraryHandlers({ repo, telemetry: { get: () => ({ track }) } } as unknown as HandlerContext)
})
afterEach(() => sqlite.close())

describe('search telemetry', () => {
  it('sends the result range and whether anything came back, never the query', async () => {
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: 'secret client brand', sort: 'date' })
    expect(track).toHaveBeenCalledTimes(1)
    const [event, props] = track.mock.calls[0] as [string, Record<string, unknown>]
    expect(event).toBe('search_performed')
    expect(props).toEqual({ hasQuery: true, tagFilter: 0, results_bucket: '0', had_results: false })
    expect(JSON.stringify(track.mock.calls)).not.toContain('secret')
  })

  it('sends nothing for a plain browse without a query', async () => {
    await call(IPC_CHANNELS.LIBRARY_LIST, { sort: 'date' })
    expect(track).not.toHaveBeenCalled()
  })
})
