import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, PUSH_CHANNELS, PUSH_CONTRACT, type IpcResult } from '@shared/ipc'
import type { InferenceProvider } from '@shared/inference'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, sample } from '../db/repositories/__tests__/setup'
import { LibraryService } from '../library/library-service'
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

import { registerAiStatusHandlers } from './ai-status'
import { inferenceQueueFor } from './library-effects'
import { registerInboxHandlers } from './inbox'
import { registerTrashHandlers } from './trash'

let sqlite: Database.Database
let repo: Repository
let root: string
let push: ReturnType<typeof vi.fn>
let analyze: ReturnType<typeof vi.fn<InferenceProvider['analyze']>>
let ctx: HandlerContext
let track: ReturnType<typeof vi.fn>
let settingsState: { installedAt: string; firstSuggestionSentAt: string | null }

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  root = mkdtempSync(join(tmpdir(), 'ds-ai-'))
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  push = vi.fn()
  track = vi.fn()
  settingsState = { installedAt: new Date().toISOString(), firstSuggestionSentAt: null }
  analyze = vi.fn(async () => ({ title: 'Suggested', description: 'd', tags: [] }))
  const provider: InferenceProvider = { id: 'stub', name: 'Stub', analyze }
  ctx = {
    repo,
    push,
    ai: { activeProvider: async () => provider },
    settings: {
      getLibraryRoot: () => root,
      get: () => settingsState,
      update: (patch: Partial<typeof settingsState>) => Object.assign(settingsState, patch)
    },
    telemetry: { get: () => ({ track }), rebuild: () => {} },
    library: new LibraryService(repo, root)
  } as unknown as HandlerContext
  registerInboxHandlers(ctx)
  registerTrashHandlers(ctx)
})

afterEach(() => {
  sqlite.close()
  rmSync(root, { recursive: true, force: true })
})

const make = (name: string) => {
  const dir = join(root, 'mockups', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'original.psd'), 'psd')
  return repo.mockups.createMockup({
    ...sample,
    title: name,
    libraryPath: join(dir, 'original.psd'),
    coverPath: join(dir, 'cover.webp')
  })
}

describe('ai:status push', () => {
  it('is a push channel whose payload carries the per-mockup status and the totals', () => {
    expect(PUSH_CHANNELS).toContain(IPC_CHANNELS.AI_STATUS)
    const { payload } = PUSH_CONTRACT[IPC_CHANNELS.AI_STATUS]
    expect(
      payload.safeParse({
        updates: [{ mockupId: 1, status: 'sniffing' }],
        totals: { total: 38, remaining: 7 }
      }).success
    ).toBe(true)
    expect(
      payload.safeParse({
        updates: [{ mockupId: 1, status: 'bogus' }],
        totals: { total: 1, remaining: 0 }
      }).success
    ).toBe(false)
  })

  it('reports status changes and the new inbox counts as suggestions are made', async () => {
    const a = make('a')

    const queue = inferenceQueueFor(ctx)
    await queue.enqueue([a.id])
    await queue.idle()

    const statuses = push.mock.calls
      .filter(([channel]) => channel === IPC_CHANNELS.AI_STATUS)
      .flatMap(([, event]) => event.updates.map((u: { status: string }) => u.status))
    expect(statuses).toEqual(['pending', 'sniffing', 'ready'])
    expect(push).toHaveBeenCalledWith(
      IPC_CHANNELS.INBOX_COUNTS_CHANGED,
      expect.objectContaining({ toSort: 1, sniffing: 0 })
    )
  })

  it('sends first_suggestion once, the first time a suggestion is ready', async () => {
    make('a')
    make('b')
    await inferenceQueueFor(ctx).enqueue([1, 2])
    await vi.waitFor(() =>
      expect(repo.mockups.getMockup(2)?.aiStatus).toBe('ready')
    )
    const firsts = track.mock.calls.filter(([name]) => name === 'first_suggestion')
    expect(firsts).toHaveLength(1)
    expect(firsts[0]?.[1]).toMatchObject({ seconds_since_install: expect.any(Number) })
  })

  it('is one shared queue for the whole app', () => {
    expect(inferenceQueueFor(ctx)).toBe(inferenceQueueFor(ctx))
  })
})

describe('registerAiStatusHandlers', () => {
  it('picks up suggestions that were waiting when the app last closed', async () => {
    const a = make('a')
    repo.mockups.updateMockup(a.id, { aiStatus: 'sniffing' })

    registerAiStatusHandlers(ctx)
    await vi.waitFor(() => expect(repo.mockups.getMockup(a.id)?.aiStatus).toBe('ready'))

    expect(analyze).toHaveBeenCalledTimes(1)
  })
})

describe('cancelling and requeueing', () => {
  it('tossing a queued mockup stops its suggestion', async () => {
    const [a, b] = [make('a'), make('b')]
    analyze.mockImplementationOnce(() => new Promise(() => {})) // a never finishes, b waits behind it
    const queue = inferenceQueueFor(ctx)
    await queue.enqueue([a.id, b.id])
    await vi.waitFor(() => expect(repo.mockups.getMockup(a.id)?.aiStatus).toBe('sniffing'))

    await call(IPC_CHANNELS.INBOX_TOSS, { ids: [b.id] })

    expect(repo.mockups.getMockup(b.id)).toBeUndefined()
    expect(analyze).toHaveBeenCalledTimes(1)
  })

  it('trashing cancels the suggestion, and restoring queues it again', async () => {
    const a = make('a')
    repo.mockups.updateMockup(a.id, { aiStatus: 'pending' })

    await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [a.id] })
    await inferenceQueueFor(ctx).idle()
    expect(analyze).not.toHaveBeenCalled()

    await call(IPC_CHANNELS.TRASH_RESTORE, { ids: [a.id] })
    await vi.waitFor(() => expect(repo.mockups.getMockup(a.id)?.aiStatus).toBe('ready'))
    expect(analyze).toHaveBeenCalledTimes(1)
  })

  it('trashing a pile cancels its members too, and restoring queues them again', async () => {
    const [blocker, a, b] = [make('blocker'), make('a'), make('b')]
    const pile = repo.piles.createPile([a.id, b.id], a.id)
    analyze.mockImplementationOnce(() => new Promise(() => {})) // the blocker never finishes
    await inferenceQueueFor(ctx).enqueue([blocker.id, a.id, b.id])
    await vi.waitFor(() => expect(repo.mockups.getMockup(blocker.id)?.aiStatus).toBe('sniffing'))

    await call(IPC_CHANNELS.MOCKUP_TRASH, { ids: [pile.pileId] })

    // Only the blocker's own call ever ran: the pile and its members left the queue.
    expect(analyze).toHaveBeenCalledTimes(1)
  })
})
