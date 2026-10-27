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
let similarities: ReturnType<typeof vi.fn>
let warm: ReturnType<typeof vi.fn>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  track = vi.fn()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  similarities = vi.fn(async () => null)
  warm = vi.fn()
  registerLibraryHandlers({
    repo,
    telemetry: { get: () => ({ track }) },
    ai: { embeddings: { similarities, warm } }
  } as unknown as HandlerContext)
})
afterEach(() => sqlite.close())

describe('search telemetry', () => {
  it('sends the result range and whether anything came back, never the query', async () => {
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: 'secret client brand', sort: 'date' })
    expect(track).toHaveBeenCalledTimes(1)
    const [event, props] = track.mock.calls[0] as [string, Record<string, unknown>]
    expect(event).toBe('search_performed')
    expect(props).toEqual({ hasQuery: true, tagFilter: 0, results_bucket: '0', had_results: false,
      meaning_hit: false
    })
    expect(JSON.stringify(track.mock.calls)).not.toContain('secret')
  })

  it('sends nothing for a plain browse without a query', async () => {
    await call(IPC_CHANNELS.LIBRARY_LIST, { sort: 'date' })
    expect(track).not.toHaveBeenCalled()
  })
})

describe('meaning search through the handler', () => {
  it('asks for similarities only for a search of 3 or more characters', async () => {
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: 'ab', sort: 'date' })
    expect(similarities).not.toHaveBeenCalled()
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: ' abc ', sort: 'date' })
    expect(similarities).toHaveBeenCalledWith('abc', { within: 300 })
    await call(IPC_CHANNELS.LIBRARY_LIST, { sort: 'date' })
    expect(similarities).toHaveBeenCalledTimes(1)
  })

  it('starts the meaning model while a search is still 1 or 2 characters, so its first search needs no wait (F-017)', async () => {
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: 'a', sort: 'date' })
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: 'ab', sort: 'date' })
    expect(warm).toHaveBeenCalledTimes(2)
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: '', sort: 'date' })
    await call(IPC_CHANNELS.LIBRARY_LIST, { query: 'abc', sort: 'date' })
    expect(warm).toHaveBeenCalledTimes(2)
  })

  it('adds the meaning hit and reports meaning_hit: true', async () => {
    const m = repo.mockups.createMockup({
      title: 'Black sweatshirt',
      libraryPath: '/lib/l/a.psd',
      coverPath: '/lib/l/a.png',
      coverSource: 'embedded',
      stage: 'stashed'
    })
    repo.search.rebuildSearchIndex()
    similarities.mockResolvedValue(new Map([[m.id, 0.7]]))
    const res = await call<{ items: { id: number }[] }>(IPC_CHANNELS.LIBRARY_LIST, {
      query: 'jumper',
      sort: 'date'
    })
    expect(res).toMatchObject({ success: true, data: { items: [{ id: m.id }] } })
    expect(track.mock.calls[0]![1]).toMatchObject({ meaning_hit: true, had_results: true })
  })
})
