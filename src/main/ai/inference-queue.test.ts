import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { AiStatusEvent } from '@shared/ipc/ai-status'
import type { AnalysisInput, InferenceProvider, InferenceResult } from '@shared/inference'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb, sample } from '../db/repositories/__tests__/setup'
import { InferenceQueue, analysisInputFor } from './inference-queue'
import { RunTimes, memoryRunTimes } from './run-timing'

const result = (title: string): InferenceResult => ({
  title,
  description: `About ${title}`,
  tags: [{ category: 'Device', label: 'phone' }]
})

/** A provider that answers from a script, one call at a time, and records how it was used. */
function stubProvider(answer: (input: AnalysisInput, call: number) => Promise<InferenceResult> | InferenceResult) {
  const calls: AnalysisInput[] = []
  let active = 0
  let maxActive = 0
  const provider: InferenceProvider = {
    id: 'stub',
    name: 'Stub',
    analyze: async (input) => {
      calls.push(input)
      active++
      maxActive = Math.max(maxActive, active)
      try {
        await Promise.resolve()
        return await answer(input, calls.length)
      } finally {
        active--
      }
    }
  }
  return { provider, calls, maxActive: () => maxActive }
}

let sqlite: Database.Database
let repo: Repository
let events: AiStatusEvent[]

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  events = []
})

afterEach(() => sqlite.close())

const imported = (name: string, extra = {}) =>
  repo.mockups.createMockup({
    ...sample,
    title: name,
    libraryPath: `/lib/${name}.psd`,
    coverPath: `/lib/${name}.webp`,
    importContext: { batchId: 'b', folderTrail: ['Phones'], originalFilename: `${name}.psd` },
    ...extra
  })

const queueWith = (provider: InferenceProvider | null, extra: Partial<ConstructorParameters<typeof InferenceQueue>[0]> = {}) =>
  new InferenceQueue({
    repo,
    getProvider: async () => provider,
    onStatus: (e) => events.push(e),
    ...extra
  })

const status = (id: number) => repo.mockups.getMockup(id)?.aiStatus

describe('InferenceQueue', () => {
  it('prepares each mockup before asking about it, and asks anyway when preparing fails', async () => {
    const order: string[] = []
    const stub = stubProvider((input) => {
      order.push(`analyze ${input.fileName}`)
      return result(input.fileName)
    })
    const [a, b] = [imported('a'), imported('b')]
    const prepare = vi.fn(async (m: { title: string }) => {
      order.push(`prepare ${m.title}`)
      if (m.title === 'b') throw new Error('no PSD')
    })
    const queue = queueWith(stub.provider, { prepare })

    await queue.enqueue([a.id, b.id])
    await queue.idle()

    expect(order).toEqual(['prepare a', 'analyze a.psd', 'prepare b', 'analyze b.psd'])
    expect([status(a.id), status(b.id)]).toEqual(['ready', 'ready'])
  })

  it('works through the files in the order they landed, one at a time', async () => {
    const stub = stubProvider((input) => result(input.fileName))
    const [a, b, c] = [imported('a'), imported('b'), imported('c')]
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id, b.id, c.id])
    await queue.idle()

    expect(stub.calls.map((c) => c.fileName)).toEqual(['a.psd', 'b.psd', 'c.psd'])
    expect(stub.maxActive()).toBe(1)
    for (const m of [a, b, c]) expect(status(m.id)).toBe('ready')
  })

  it('sends the cover, file name and folders to the provider', async () => {
    const stub = stubProvider(() => result('x'))
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await queue.idle()

    expect(stub.calls[0]).toEqual({
      imagePath: '/lib/a.webp',
      fileName: 'a.psd',
      folderTrail: ['Phones']
    })
  })

  it('keeps the suggestion on the mockup without changing its title', async () => {
    const stub = stubProvider(() => result('Clay phone'))
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await queue.idle()

    const stored = repo.mockups.getMockup(a.id)!
    expect(stored.aiResult).toEqual(result('Clay phone'))
    expect(stored.title).toBe('a')
  })

  it('shows pending, then sniffing, then ready, with the totals each time', async () => {
    const stub = stubProvider(() => result('x'))
    const [a, b] = [imported('a'), imported('b')]
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id, b.id])
    await queue.idle()

    expect(events[0]).toEqual({
      updates: [
        { mockupId: a.id, status: 'pending' },
        { mockupId: b.id, status: 'pending' }
      ],
      totals: { total: 2, remaining: 2 }
    })
    const writing = { run: expect.objectContaining({ phase: 'writing' }) }
    expect(events.slice(1).map((e) => e.updates)).toEqual([
      [{ mockupId: a.id, status: 'sniffing', ...writing }],
      [{ mockupId: a.id, status: 'ready' }],
      [{ mockupId: b.id, status: 'sniffing', ...writing }],
      [{ mockupId: b.id, status: 'ready' }]
    ])
    expect(events.at(-1)!.totals).toEqual({ total: 2, remaining: 0 })
    expect(events[2]!.totals).toEqual({ total: 2, remaining: 1 })
  })

  it('tries once more after a failure and succeeds', async () => {
    const stub = stubProvider((_i, call) => {
      if (call === 1) throw new Error('model hiccup')
      return result('second time')
    })
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await queue.idle()

    expect(stub.calls).toHaveLength(2)
    expect(status(a.id)).toBe('ready')
    expect(repo.mockups.getMockup(a.id)?.aiResult).toEqual(result('second time'))
  })

  it('marks a mockup failed after two failures and moves on to the next', async () => {
    const stub = stubProvider((input) => {
      if (input.fileName === 'a.psd') throw new Error('always fails')
      return result('b is fine')
    })
    const [a, b] = [imported('a'), imported('b')]
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id, b.id])
    await queue.idle()

    expect(stub.calls.map((c) => c.fileName)).toEqual(['a.psd', 'a.psd', 'b.psd'])
    expect(status(a.id)).toBe('failed')
    expect(repo.mockups.getMockup(a.id)?.aiResult).toBeNull()
    expect(status(b.id)).toBe('ready')
  })

  it('treats an answer that does not fit the format as a failure', async () => {
    const stub = stubProvider(() => ({ title: 5 }) as unknown as InferenceResult)
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await queue.idle()

    expect(status(a.id)).toBe('failed')
  })

  it('marks mockups off when there is no provider, and never asks one', async () => {
    const a = imported('a')
    const queue = queueWith(null)

    await queue.enqueue([a.id])
    await queue.idle()

    // A new mockup is already 'off', so there is nothing to announce.
    expect(status(a.id)).toBe('off')
    expect(events).toEqual([])
  })

  it('skips a mockup that already has its suggestion', async () => {
    const stub = stubProvider(() => result('x'))
    const a = imported('a')
    repo.mockups.updateMockup(a.id, { aiStatus: 'ready', aiResult: result('earlier') })
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await queue.idle()

    expect(stub.calls).toHaveLength(0)
    expect(repo.mockups.getMockup(a.id)?.aiResult).toEqual(result('earlier'))
  })

  it('ignores mockups that are stashed, in Trash or gone', async () => {
    const stub = stubProvider(() => result('x'))
    const stashed = repo.mockups.createMockup(approvedMockup({ title: 's', libraryPath: '/lib/s.psd' }))
    const trashed = imported('t')
    repo.trash.moveToTrash(trashed.id)
    const queue = queueWith(stub.provider)

    await queue.enqueue([stashed.id, trashed.id, 9999])
    await queue.idle()

    expect(stub.calls).toHaveLength(0)
    expect(status(stashed.id)).toBe('off')
  })

  it('drops queued files that are cancelled, such as ones tossed or trashed', async () => {
    const stub = stubProvider(() => result('x'))
    const [a, b, c] = [imported('a'), imported('b'), imported('c')]
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id, b.id, c.id])
    queue.cancel([b.id])
    await queue.idle()

    expect(stub.calls.map((c) => c.fileName)).toEqual(['a.psd', 'c.psd'])
    expect(status(b.id)).toBe('pending')
  })

  it('throws away the answer for a file cancelled while it was being read', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const stub = stubProvider(async () => {
      await gate
      return result('late')
    })
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await vi.waitFor(() => expect(status(a.id)).toBe('sniffing'))
    queue.cancel([a.id])
    release()
    await queue.idle()

    expect(repo.mockups.getMockup(a.id)?.aiResult).toBeNull()
    expect(status(a.id)).toBe('pending')
  })

  it('does not write to a mockup that was tossed while it was being read', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const stub = stubProvider(async () => {
      await gate
      return result('late')
    })
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await vi.waitFor(() => expect(status(a.id)).toBe('sniffing'))
    repo.trash.deleteMockupsHard([a.id])
    release()
    await queue.idle()

    expect(repo.mockups.getMockup(a.id)).toBeUndefined()
  })

  it('picks up where it left off after a restart, in the original order', async () => {
    // First run: the app closes with one file mid-read and two waiting.
    const [a, b, c] = [imported('a'), imported('b'), imported('c')]
    repo.mockups.updateMockup(a.id, { aiStatus: 'sniffing' })
    repo.mockups.updateMockup(b.id, { aiStatus: 'pending' })
    repo.mockups.updateMockup(c.id, { aiStatus: 'pending' })
    const done = imported('done')
    repo.mockups.updateMockup(done.id, { aiStatus: 'ready', aiResult: result('kept') })

    const stub = stubProvider((input) => result(input.fileName))
    const restarted = queueWith(stub.provider)
    await restarted.resume()
    await restarted.idle()

    expect(stub.calls.map((c) => c.fileName)).toEqual(['a.psd', 'b.psd', 'c.psd'])
    for (const m of [a, b, c]) expect(status(m.id)).toBe('ready')
    expect(repo.mockups.getMockup(done.id)?.aiResult).toEqual(result('kept'))
  })

  it('reads pile members waiting in To stash, when queued and after a restart', async () => {
    const stub = stubProvider((input) => result(input.fileName))
    const [top, side, back] = [imported('top'), imported('side'), imported('back')]
    repo.piles.createPile([top.id, side.id, back.id], top.id)
    repo.mockups.setStage([top.id, side.id, back.id], 'to_stash')
    repo.mockups.updateMockup(back.id, { aiStatus: 'pending' })

    const queue = queueWith(stub.provider)
    await queue.enqueue([side.id])
    await queue.idle()
    const restarted = queueWith(stub.provider)
    await restarted.resume()
    await restarted.idle()

    expect(status(side.id)).toBe('ready')
    expect(status(back.id)).toBe('ready')
    expect(stub.calls.map((c) => c.fileName).sort()).toEqual(['back.psd', 'side.psd'])
  })

  it('on restart with no provider, marks what was waiting as off', async () => {
    const a = imported('a')
    repo.mockups.updateMockup(a.id, { aiStatus: 'pending' })

    const restarted = queueWith(null)
    await restarted.resume()
    await restarted.idle()

    expect(status(a.id)).toBe('off')
    expect(events.at(-1)!.updates).toEqual([{ mockupId: a.id, status: 'off' }])
  })

  it('does not run a file twice when it is enqueued again while waiting', async () => {
    const stub = stubProvider(() => result('x'))
    const a = imported('a')
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id])
    await queue.enqueue([a.id])
    await queue.idle()

    expect(stub.calls).toHaveLength(1)
  })

  it('keeps working after a file that crashes the provider', async () => {
    const stub = stubProvider((input) => {
      if (input.fileName === 'a.psd') throw new Error('boom')
      return result('ok')
    })
    const [a, b] = [imported('a'), imported('b')]
    const queue = queueWith(stub.provider)

    await queue.enqueue([a.id, b.id])
    await queue.idle()

    expect(status(a.id)).toBe('failed')
    expect(status(b.id)).toBe('ready')
  })
})

describe('pile context', () => {
  function stashedTop() {
    const top = repo.mockups.createMockup(
      approvedMockup({ title: 'Tape roll on a wall', description: 'A roll of tape on a white wall.', isGroup: true })
    )
    const device = repo.tags.getCategoryByLabel('Device') ?? repo.tags.createCategory({ label: 'Device' })
    const tag = repo.tags.createTag({ categoryId: device.id, label: 'tape' })
    repo.mockups.addTagToMockup(top.id, tag.id)
    return top
  }

  // Round 3 B (design/research/ai-round3.md): any of the top's words made variants copy its scene.
  it('analyses a variant alone, even when its pile’s first mockup is stashed', async () => {
    const top = stashedTop()
    const variant = imported('Tape 2', { stage: 'to_stash', groupId: top.id })
    const { provider, calls } = stubProvider(() => result('Tape'))
    const queue = new InferenceQueue({ repo, getProvider: async () => provider, onStatus: () => {} })
    await queue.enqueue([variant.id])
    await queue.idle()
    expect(calls[0]).toEqual({ imagePath: '/lib/Tape 2.webp', fileName: 'Tape 2.psd', folderTrail: ['Phones'] })
  })

  it('analyses a variant alone while its pile’s first mockup is still waiting to be looked over', async () => {
    const top = repo.mockups.createMockup(approvedMockup({ title: 'Top', stage: 'to_stash', isGroup: true }))
    const variant = imported('Tape 2', { stage: 'to_stash', groupId: top.id })
    const single = imported('Alone')
    const { provider, calls } = stubProvider(() => result('Tape'))
    const queue = new InferenceQueue({ repo, getProvider: async () => provider, onStatus: () => {} })
    await queue.enqueue([variant.id, single.id])
    await queue.idle()
    expect(calls.map((c) => c.groupContext)).toEqual([undefined, undefined])
  })
})

describe('analysisInputFor', () => {
  it('shows the cover, the name the file came in as, and its folders', () => {
    const m = imported('front')
    expect(analysisInputFor(m)).toEqual({
      imagePath: '/lib/front.webp',
      fileName: 'front.psd',
      folderTrail: ['Phones']
    })
  })

  it('falls back to the title and no folders when nothing is known about where it came from', () => {
    const m = imported('side', { importContext: null })
    expect(analysisInputFor(m)).toEqual({ imagePath: '/lib/side.webp', fileName: 'side', folderTrail: [] })
  })
})

/** A promise to settle by hand. */
function later<T = void>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

describe('what Look it over is told about a run (design L6)', () => {
  it('puts the mockups on screen first, in the order given, once the one being read is done', async () => {
    const gate = later()
    const stub = stubProvider(async (input, call) => {
      if (call === 1) await gate.promise
      return result(input.fileName)
    })
    const [a, b, c, d] = [imported('a'), imported('b'), imported('c'), imported('d')]
    const queue = queueWith(stub.provider)
    await queue.enqueue([a.id, b.id, c.id, d.id])
    await vi.waitFor(() => expect(stub.calls).toHaveLength(1))

    queue.prioritise([d.id, 9999, c.id, a.id])
    gate.resolve()
    await queue.idle()

    expect(stub.calls.map((i) => i.fileName)).toEqual(['a.psd', 'd.psd', 'c.psd', 'b.psd'])
  })

  it("starts the clock when the model begins on a mockup, and says how long before it's taking a while", async () => {
    let now = 1_000
    const times = memoryRunTimes()
    times.set({ 'qwen3.5-9b': [12_000, 12_000, 13_000, 14_000, 15_000] })
    const stub = stubProvider(() => {
      now += 14_000
      return result('x')
    })
    const a = imported('a')
    const timing = new RunTimes(times)
    const expected = timing.slowAfterMs('qwen3.5-9b')
    const queue = queueWith(stub.provider, { now: () => now, model: () => 'qwen3.5-9b', timing })

    await queue.enqueue([a.id])
    await queue.idle()

    expect(events.flatMap((e) => e.updates).find((u) => u.status === 'sniffing')).toEqual({
      mockupId: a.id,
      status: 'sniffing',
      run: { phase: 'writing', writingSince: 1_000, slowAfterMs: expected }
    })
    expect(times.get()['qwen3.5-9b']!.at(-1)).toBe(14_000)
  })

  it('says the model is starting while it loads, and starts the clock once it answers', async () => {
    let now = 0
    const loading = later()
    let loaded = false
    const stub = stubProvider(() => result('x'))
    const provider: InferenceProvider = {
      ...stub.provider,
      get loaded() {
        return loaded
      },
      load: async () => {
        await loading.promise
        loaded = true
      }
    }
    const a = imported('a')
    const queue = queueWith(provider, { now: () => now })

    await queue.enqueue([a.id])
    await vi.waitFor(() => expect(queue.statusOf(a.id)).toMatchObject({ status: 'sniffing', run: { phase: 'starting', writingSince: null } }))
    expect(stub.calls).toHaveLength(0)
    now = 6_000
    loading.resolve()
    await queue.idle()

    const runs = events.flatMap((e) => e.updates).filter((u) => u.status === 'sniffing').map((u) => u.run)
    expect(runs).toEqual([expect.objectContaining({ phase: 'starting', writingSince: null }), expect.objectContaining({ phase: 'writing', writingSince: 6_000 })])
  })

  it('times only the runs that wrote a suggestion, for the model they ran on', async () => {
    const times = memoryRunTimes()
    const stub = stubProvider((input) => {
      if (input.fileName === 'b.psd') throw new Error('no')
      return result('x')
    })
    const queue = queueWith(stub.provider, { model: () => 'apple', timing: new RunTimes(times) })
    await queue.enqueue([imported('a').id, imported('b').id])
    await queue.idle()
    expect(times.get().apple).toHaveLength(1)
  })

  it('tells where one mockup is: queued, its run, or how it ended', async () => {
    const gate = later()
    const stub = stubProvider(async () => {
      await gate.promise
      return result('x')
    })
    const [a, b] = [imported('a'), imported('b')]
    const queue = queueWith(stub.provider)
    await queue.enqueue([a.id, b.id])
    await vi.waitFor(() => expect(stub.calls).toHaveLength(1))

    expect(queue.statusOf(a.id)).toMatchObject({ mockupId: a.id, status: 'sniffing', run: { phase: 'writing' } })
    // Queued, the renderer counts from when it came on screen, so it gets the threshold too.
    expect(queue.statusOf(b.id)).toEqual({ mockupId: b.id, status: 'pending', run: { phase: 'queued', writingSince: null, slowAfterMs: expect.any(Number) } })
    gate.resolve()
    await queue.idle()
    expect(queue.statusOf(a.id)).toEqual({ mockupId: a.id, status: 'ready' })
    expect(queue.statusOf(9999)).toBeNull()
  })
})
