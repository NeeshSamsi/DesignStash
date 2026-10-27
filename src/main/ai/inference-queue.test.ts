import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { AiStatusEvent } from '@shared/ipc/ai-status'
import type { AnalysisInput, InferenceProvider, InferenceResult } from '@shared/inference'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb, sample } from '../db/repositories/__tests__/setup'
import { PileTitles } from '../library/pile-titles'
import { InferenceQueue, analysisInputFor } from './inference-queue'
import { HARD_STOP_FACTOR, RunTimes, memoryRunTimes } from './run-timing'

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

  it("starts the clock once the mockup's files are readied, so a slow slot mask is never the model's time (F-036)", async () => {
    let now = 1_000
    const times = memoryRunTimes()
    times.set({ 'qwen3.5-9b': [12_000, 12_000, 13_000, 14_000, 15_000] })
    const timing = new RunTimes(times)
    const slowAfterMs = timing.slowAfterMs('qwen3.5-9b')
    const stub = stubProvider(() => {
      now += 9_000
      return result('x')
    })
    const hardStops: number[] = []
    const a = imported('a')
    let whilePreparing: unknown = null
    const queue = queueWith(stub.provider, {
      now: () => now,
      model: () => 'qwen3.5-9b',
      timing,
      // A kit of smart objects: its mask takes 4 s, and it still waits its turn to be written meanwhile.
      prepare: async () => {
        whilePreparing = queue.statusOf(a.id)
        now += 4_000
      },
      timer: (ms) => {
        hardStops.push(ms)
        return () => {}
      }
    })

    await queue.enqueue([a.id])
    await queue.idle()

    const runs = events.flatMap((e) => e.updates).filter((u) => u.status === 'sniffing').map((u) => u.run)
    expect(runs).toEqual([{ phase: 'writing', writingSince: 5_000, slowAfterMs }])
    expect(times.get()['qwen3.5-9b']!.at(-1)).toBe(9_000)
    expect(hardStops).toEqual([HARD_STOP_FACTOR * slowAfterMs])
    expect(whilePreparing).toEqual({ mockupId: a.id, status: 'pending', run: { phase: 'queued', writingSince: null, slowAfterMs } })
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

  describe('the hard stop (design L6.E3)', () => {
    /** A timer the test fires by hand, recording what it was set for and whether it was cleared. */
    function handTimer() {
      const set: { ms: number; fire: () => void; cleared: boolean }[] = []
      return {
        set,
        timer: (ms: number, fire: () => void) => {
          const t = { ms, fire, cleared: false }
          set.push(t)
          return () => {
            t.cleared = true
          }
        }
      }
    }

    it("stops a run at 3 times the slow threshold: the mockup can't be written, the model is stopped, and the queue moves on", async () => {
      const stuck = later<InferenceResult>()
      const stub = stubProvider((input) => (input.fileName === 'a.psd' ? stuck.promise : result('b')))
      const stop = vi.fn(async () => stuck.resolve(Promise.reject(new Error('stopped')) as never))
      const timing = new RunTimes(memoryRunTimes())
      const hand = handTimer()
      const queue = queueWith({ ...stub.provider, stop }, { model: () => 'qwen3-vl-4b', timing, timer: hand.timer, now: () => 0 })
      const [a, b] = [imported('a'), imported('b')]

      await queue.enqueue([a.id, b.id])
      await vi.waitFor(() => expect(hand.set).toHaveLength(1))
      expect(hand.set[0]!.ms).toBe(3 * timing.slowAfterMs('qwen3-vl-4b'))
      hand.set[0]!.fire()
      await queue.idle()

      expect(stop).toHaveBeenCalledTimes(1)
      expect(status(a.id)).toBe('failed')
      expect(status(b.id)).toBe('ready')
      // Stopped, so it isn't tried again.
      expect(stub.calls.map((i) => i.fileName)).toEqual(['a.psd', 'b.psd'])
    })

    it('logs a hard stop: the mockup, how long it ran on which model, its threshold, and that the model starts again (F-075)', async () => {
      let now = 0
      const stuck = later<InferenceResult>()
      const stub = stubProvider(() => stuck.promise)
      const stop = vi.fn(async () => stuck.resolve(Promise.reject(new Error('stopped')) as never))
      const times = memoryRunTimes()
      // A median of 14 s: the 9B's slow threshold is its floor, 35 s, and the stop is at 105 s.
      times.set({ 'qwen3.5-9b': [14_000, 14_000, 14_000, 14_000, 14_000] })
      const hand = handTimer()
      const log = vi.fn<(line: string) => void>()
      const queue = queueWith({ ...stub.provider, stop }, { model: () => 'qwen3.5-9b', timing: new RunTimes(times), timer: hand.timer, now: () => now, log })
      const a = imported('a')

      await queue.enqueue([a.id])
      await vi.waitFor(() => expect(hand.set).toHaveLength(1))
      now = 105_000
      hand.set[0]!.fire()
      await queue.idle()

      expect(log.mock.calls.map(([line]) => line)).toEqual([
        `[AI] Hard stop: mockup ${a.id} ran 105.0 s on qwen3.5-9b, 3 times its slow threshold of 35.0 s. The model is stopped, and starts again on the next request.`
      ])
    })

    it('clears the stop when the run ends in time', async () => {
      const stop = vi.fn(async () => {})
      const stub = stubProvider(() => result('a'))
      const hand = handTimer()
      const queue = queueWith({ ...stub.provider, stop }, { timer: hand.timer })
      const a = imported('a')

      await queue.enqueue([a.id])
      await queue.idle()

      expect(status(a.id)).toBe('ready')
      expect(hand.set.map((t) => t.cleared)).toEqual([true])
      expect(stop).not.toHaveBeenCalled()
    })

    it('never writes the answer a stopped run sends late', async () => {
      const stuck = later<InferenceResult>()
      const stub = stubProvider(() => stuck.promise)
      const hand = handTimer()
      const queue = queueWith(stub.provider, { timer: hand.timer })
      const a = imported('a')

      await queue.enqueue([a.id])
      await vi.waitFor(() => expect(hand.set).toHaveLength(1))
      hand.set[0]!.fire()
      await queue.idle()
      stuck.resolve(result('late'))
      await Promise.resolve()

      expect(status(a.id)).toBe('failed')
      expect(repo.mockups.getMockup(a.id)?.aiResult).toBeNull()
    })

    it('counts the stop from when the model begins, after its files are readied (F-036)', async () => {
      let now = 0
      const hand = handTimer()
      const stub = stubProvider(() => result('a'))
      const timing = new RunTimes(memoryRunTimes())
      const queue = queueWith(stub.provider, {
        model: () => 'apple',
        timing,
        timer: hand.timer,
        now: () => now,
        prepare: async () => {
          now += 1_000
        }
      })

      await queue.enqueue([imported('a').id])
      await queue.idle()

      expect(hand.set[0]!.ms).toBe(3 * timing.slowAfterMs('apple'))
    })
  })

  describe('Fill it myself and Write suggestions (design L6.E1, L6.E3)', () => {
    it('drops a queued mockup the person fills in themselves, and never asks about it again', async () => {
      const gate = later()
      const stub = stubProvider(async (input) => {
        if (input.fileName === 'a.psd') await gate.promise
        return result(input.fileName)
      })
      const queue = queueWith(stub.provider)
      const [a, b] = [imported('a'), imported('b')]
      await queue.enqueue([a.id, b.id])
      await vi.waitFor(() => expect(stub.calls).toHaveLength(1))

      queue.optOut(b.id)
      gate.resolve()
      await queue.idle()
      await queue.enqueue([b.id])
      await queue.idle()

      expect(stub.calls.map((i) => i.fileName)).toEqual(['a.psd'])
      expect(status(b.id)).toBe('opted_out')
      expect(queue.statusOf(b.id)).toEqual({ mockupId: b.id, status: 'opted_out' })
      expect(events.flatMap((e) => e.updates)).toContainEqual({ mockupId: b.id, status: 'opted_out' })
    })

    it("stops the run on a mockup the person fills in themselves while it's being written, and moves on", async () => {
      const stuck = later<InferenceResult>()
      const stub = stubProvider((input) => (input.fileName === 'a.psd' ? stuck.promise : result('b')))
      const stop = vi.fn(async () => stuck.resolve(Promise.reject(new Error('stopped')) as never))
      const log = vi.fn<(line: string) => void>()
      const queue = queueWith({ ...stub.provider, stop }, { log })
      const [a, b] = [imported('a'), imported('b')]
      await queue.enqueue([a.id, b.id])
      await vi.waitFor(() => expect(stub.calls).toHaveLength(1))

      queue.optOut(a.id)
      await queue.idle()

      expect(stop).toHaveBeenCalledTimes(1)
      // It restarts the model, so the log says so (F-075).
      expect(log.mock.calls.map(([line]) => line)).toEqual([
        `[AI] Mockup ${a.id} was filled in by the person while it was being written. The model is stopped, and starts again on the next request.`
      ])
      expect(status(a.id)).toBe('opted_out')
      expect(status(b.id)).toBe('ready')
      expect(stub.calls.map((i) => i.fileName)).toEqual(['a.psd', 'b.psd'])
    })

    it('never writes an answer that lands after the person chose to fill it in', async () => {
      const slow = later<InferenceResult>()
      const stub = stubProvider(() => slow.promise)
      const queue = queueWith(stub.provider)
      const a = imported('a')
      await queue.enqueue([a.id])
      await vi.waitFor(() => expect(stub.calls).toHaveLength(1))

      queue.optOut(a.id)
      slow.resolve(result('late'))
      await queue.idle()

      expect(status(a.id)).toBe('opted_out')
      expect(repo.mockups.getMockup(a.id)?.aiResult).toBeNull()
    })

    it('leaves alone a mockup whose suggestion already landed', async () => {
      const queue = queueWith(stubProvider(() => result('a')).provider)
      const a = imported('a')
      await queue.enqueue([a.id])
      await queue.idle()
      queue.optOut(a.id)
      expect(status(a.id)).toBe('ready')
    })

    it('asks again for one the person filled in themselves, or one that could not be written', async () => {
      const stub = stubProvider((input) => result(input.fileName))
      const queue = queueWith(stub.provider)
      const [a, b] = [imported('a'), imported('b')]
      repo.mockups.updateMockup(a.id, { aiStatus: 'opted_out' })
      repo.mockups.updateMockup(b.id, { aiStatus: 'failed' })

      await queue.askAgain(a.id)
      await queue.askAgain(b.id)
      await queue.idle()

      expect([status(a.id), status(b.id)]).toEqual(['ready', 'ready'])
      expect(events.flatMap((e) => e.updates).filter((u) => u.mockupId === a.id).map((u) => u.status)).toEqual(['pending', 'sniffing', 'ready'])
    })
  })

  describe("a pile's variations (L8)", () => {
    /** A pile waiting in To stash, its drafts made as Look it over makes them. */
    const waitingPile = (...names: string[]) => {
      const rows = names.map((n) => imported(n))
      repo.piles.createPile(rows.map((r) => r.id), rows[0]!.id)
      repo.mockups.setStage(rows.map((r) => r.id), 'to_stash')
      for (const r of rows) repo.drafts.ensureDraft(r.id, { title: 'Phone', description: '', tagIds: [] })
      return rows
    }
    const variation = (id: number) => {
      const d = repo.drafts.getDraft(id)!
      return d.variation === null ? null : { words: d.variation, source: d.variationSource }
    }
    /** A provider that writes suggestions and names a pile's variations as told, noting how many suggestions came first. */
    const namer = (answer: (pile: { coverPath: string; fileName: string }[]) => Promise<(string | null)[]> | (string | null)[]) => {
      const stub = stubProvider((input) => result(input.fileName))
      const before: number[] = []
      const pileVariations = vi.fn(async (pile: { coverPath: string; fileName: string }[]) => {
        before.push(stub.calls.length)
        return { variations: await answer(pile), base: null }
      })
      return { ...stub, provider: { ...stub.provider, pileVariations }, pileVariations, before }
    }

    it("asks a pile for every mockup's variation once its own suggestions are done, and lands them", async () => {
      const [top, side] = waitingPile('phone_front', 'phone_side')
      const named = namer(() => ['front', 'side view'])
      const landed: [number, number[]][] = []
      const queue = queueWith(named.provider, { onVariations: (pileId, ids) => landed.push([pileId, ids]) })

      await queue.enqueue([top!.id, side!.id])
      await queue.idle()

      expect(named.before).toEqual([2])
      expect(named.pileVariations.mock.calls[0]![0]).toEqual([
        { coverPath: top!.coverPath, fileName: 'phone_front.psd' },
        { coverPath: side!.coverPath, fileName: 'phone_side.psd' }
      ])
      expect([variation(top!.id), variation(side!.id)]).toEqual([
        { words: 'front', source: 'ai' },
        { words: 'side view', source: 'ai' }
      ])
      expect(landed).toEqual([[top!.id, [top!.id, side!.id]]])
    })

    it('numbers words the app gives twice, gives "same" or no answer the fallback, and keeps words a person typed', async () => {
      const [a, b, c, d] = waitingPile('tote-a', 'tote-b', 'tote-c', 'tote-d')
      repo.drafts.updateDraft(d!.id, { variation: 'my favourite', variationSource: 'typed' })
      const queue = queueWith(namer(() => ['side', 'side', null, 'front']).provider)

      await queue.enqueue([a!.id, b!.id, c!.id, d!.id])
      await queue.idle()

      expect([a, b, c, d].map((m) => variation(m!.id))).toEqual([
        { words: 'side', source: 'ai' },
        { words: 'side 2', source: 'ai' },
        { words: 'C', source: 'marker' },
        { words: 'my favourite', source: 'typed' }
      ])
    })

    it('waits while any mockup in the pile is still waiting for its own suggestion', async () => {
      const [top, side] = waitingPile('phone_front', 'phone_side')
      repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
      const named = namer(() => ['front', 'side'])
      const queue = queueWith(named.provider)

      await queue.enqueue([top!.id])
      await queue.idle()
      expect(named.pileVariations).not.toHaveBeenCalled()

      await queue.enqueue([side!.id])
      await queue.idle()
      expect(named.pileVariations).toHaveBeenCalledOnce()
    })

    it("asks nothing until Look it over has made the pile's drafts, then asks when told to", async () => {
      const rows = [imported('phone_front'), imported('phone_side')]
      repo.piles.createPile(rows.map((r) => r.id), rows[0]!.id)
      repo.mockups.setStage(rows.map((r) => r.id), 'to_stash')
      const named = namer(() => ['front', 'side'])
      const queue = queueWith(named.provider)

      await queue.enqueue(rows.map((r) => r.id))
      await queue.idle()
      expect(named.pileVariations).not.toHaveBeenCalled()

      for (const r of rows) repo.drafts.ensureDraft(r.id, { title: 'Phone', description: '', tagIds: [] })
      await queue.askPile(rows[0]!.id)
      await queue.idle()
      expect(named.pileVariations).toHaveBeenCalledOnce()
    })

    it('asks a pile again when a mockup joins it, and not while it stays the same', async () => {
      const [top, side] = waitingPile('phone_front', 'phone_side')
      const named = namer((pile) => pile.map((m) => m.fileName.replace('.psd', '')))
      const queue = queueWith(named.provider)
      await queue.enqueue([top!.id, side!.id])
      await queue.idle()

      await queue.askPile(top!.id)
      await queue.idle()
      expect(named.pileVariations).toHaveBeenCalledTimes(1)

      const back = imported('phone_back', { aiStatus: 'ready', aiResult: result('back') })
      repo.piles.addToPile(top!.id, [back.id])
      repo.mockups.setStage([back.id], 'to_stash')
      repo.drafts.ensureDraft(back.id, { title: 'Phone', description: '', tagIds: [] })
      await queue.askPile(top!.id)
      await queue.idle()

      expect(named.pileVariations).toHaveBeenCalledTimes(2)
      expect(named.pileVariations.mock.calls[1]![0]).toHaveLength(3)
      expect(variation(back.id)).toEqual({ words: 'phone_back', source: 'ai' })
    })

    it('names a pile in My Stash, on its mockups, when a mockup joins it there', async () => {
      const rows = ['clay', 'realistic'].map((n) => imported(`watch-${n}`, { aiStatus: 'ready', aiResult: result(n) }))
      repo.piles.createPile(rows.map((r) => r.id), rows[0]!.id)
      repo.mockups.setStage(rows.map((r) => r.id), 'stashed')
      const queue = queueWith(namer(() => ['clay render', 'realistic']).provider)

      await queue.askPile(rows[0]!.id)
      await queue.idle()

      expect(rows.map((r) => repo.mockups.getMockup(r.id)!.variation)).toEqual(['clay render', 'realistic'])
    })

    it("leaves a model that doesn't name variations (Apple) to the fallback", async () => {
      const [top, side] = waitingPile('phone_front', 'phone_side')
      const queue = queueWith(stubProvider((input) => result(input.fileName)).provider)
      await queue.enqueue([top!.id, side!.id])
      await queue.askPile(top!.id)
      await queue.idle()
      expect([variation(top!.id), variation(side!.id)]).toEqual([null, null])
    })

    it('keeps the fallback when the request fails or gets stuck, and the queue moves on', async () => {
      const [top, side] = waitingPile('phone_front', 'phone_side')
      const stuck = later<(string | null)[]>()
      const named = namer(() => stuck.promise)
      const stop = vi.fn(async () => stuck.resolve(Promise.reject(new Error('stopped')) as never))
      const timers: (() => void)[] = []
      let now = 0
      const times = memoryRunTimes()
      times.set({ 'qwen3.5-9b': [14_000, 14_000, 14_000, 14_000, 14_000] })
      const log = vi.fn<(line: string) => void>()
      const queue = queueWith({ ...named.provider, stop }, {
        timer: (_ms, fire) => {
          timers.push(fire)
          return () => {}
        },
        model: () => 'qwen3.5-9b',
        timing: new RunTimes(times),
        now: () => now,
        log
      })
      const other = imported('other')

      await queue.enqueue([top!.id, side!.id, other.id])
      await vi.waitFor(() => expect(named.pileVariations).toHaveBeenCalledOnce())
      now += 105_000
      timers.at(-1)!()
      await queue.idle()

      expect(stop).toHaveBeenCalledOnce()
      // Logged, with the pile and how long it ran (F-075).
      expect(log.mock.calls.map(([line]) => line)).toEqual([
        `[AI] Hard stop: the variations for pile ${top!.id} ran 105.0 s on qwen3.5-9b, 3 times its slow threshold of 35.0 s. The model is stopped, and starts again on the next request.`
      ])
      expect(variation(top!.id)).toBeNull()
      expect(status(other.id)).toBe('ready')
    })

    describe("the pile's base, with a model that names it (the 9B, round 4 B)", () => {
      const OWN = 'Long scroll MacBook on wavy sheets'
      /** A pile in To stash whose top's suggestion has landed in its drafts, as Look it over leaves it: every draft holds the top's own title. */
      const namedPile = (...names: string[]) => {
        const rows = waitingPile(...names)
        repo.mockups.updateMockup(rows[0]!.id, { aiStatus: 'ready', aiResult: result(OWN) })
        for (const r of rows.slice(1)) repo.mockups.updateMockup(r.id, { aiStatus: 'ready', aiResult: result(r.title) })
        for (const r of rows) repo.drafts.updateDraft(r.id, { title: OWN })
        return rows
      }
      const base = (id: number) => repo.drafts.getDraft(id)!.title
      /** A provider that names bases (unless `names` is false): each call answers its variations, and the base from the top's title it was given. */
      const baseNamer = (answer: (topTitle: string) => string | null, names = true) => {
        const stub = stubProvider((input) => result(input.fileName))
        const pileVariations = vi.fn(async (pile: { coverPath: string; fileName: string }[], topTitle?: string) => ({
          variations: pile.map((m) => m.fileName.replace('.psd', '')),
          base: topTitle === undefined ? null : answer(topTitle)
        }))
        return { provider: { ...stub.provider, pileVariations, ...(names && { pileBase: true }) }, pileVariations }
      }

      it("asks for the base with the variations, from the top's own title, and gives it to every mockup in the pile", async () => {
        const [top, side] = namedPile('scroll_wavy', 'scroll_flat')
        const named = baseNamer(() => 'Long scroll MacBook')
        const landed: [number, number[]][] = []
        const queue = queueWith(named.provider, { onVariations: (pileId, ids) => landed.push([pileId, ids]) })

        await queue.askPile(top!.id)
        await queue.idle()

        expect(named.pileVariations.mock.calls[0]![1]).toBe(OWN)
        expect([base(top!.id), base(side!.id)]).toEqual(['Long scroll MacBook', 'Long scroll MacBook'])
        expect(repo.drafts.getDraft(top!.id)!.keptFields).not.toContain('title')
        expect(variation(side!.id)).toEqual({ words: 'scroll_flat', source: 'ai' })
        expect(landed).toEqual([[top!.id, [top!.id, side!.id]]])
      })

      it('keeps a base the person typed, and asks only for the variations', async () => {
        const [top, side] = namedPile('scroll_wavy', 'scroll_flat')
        new PileTitles(repo).renameBase(top!.id, 'My scroll MacBook')
        const named = baseNamer(() => 'Long scroll MacBook')
        const queue = queueWith(named.provider)

        await queue.askPile(top!.id)
        await queue.idle()

        expect(named.pileVariations.mock.calls[0]![1]).toBeUndefined()
        expect([base(top!.id), base(side!.id)]).toEqual(['My scroll MacBook', 'My scroll MacBook'])
      })

      it('keeps a base the person types while the model writes', async () => {
        const [top] = namedPile('scroll_wavy', 'scroll_flat')
        const named = baseNamer(() => {
          new PileTitles(repo).renameBase(top!.id, 'Typed meanwhile')
          return 'Long scroll MacBook'
        })
        const queue = queueWith(named.provider)

        await queue.askPile(top!.id)
        await queue.idle()

        expect(base(top!.id)).toBe('Typed meanwhile')
      })

      it("waits for the top's suggestion to land in its draft, then asks for the base once", async () => {
        const [top, side] = namedPile('scroll_wavy', 'scroll_flat')
        repo.drafts.updateDraft(top!.id, { title: 'scroll', awaitingAi: true })
        repo.drafts.updateDraft(side!.id, { title: 'scroll' })
        const named = baseNamer(() => 'Long scroll MacBook')
        const queue = queueWith(named.provider)

        await queue.askPile(top!.id)
        await queue.idle()
        expect(named.pileVariations.mock.calls.map((c) => c[1])).toEqual([undefined])
        expect(base(side!.id)).toBe('scroll')

        // Look it over settles the top: its suggestion names the pile, and the pile is asked again.
        repo.drafts.updateDraft(top!.id, { awaitingAi: false })
        new PileTitles(repo).renameBase(top!.id, OWN, 'ai')
        await queue.askPile(top!.id)
        await queue.idle()
        expect(named.pileVariations.mock.calls.map((c) => c[1])).toEqual([undefined, OWN])
        expect([base(top!.id), base(side!.id)]).toEqual(['Long scroll MacBook', 'Long scroll MacBook'])

        await queue.askPile(top!.id)
        await queue.idle()
        expect(named.pileVariations).toHaveBeenCalledTimes(2)
      })

      it("asks no more for a base that came back as the top's own title", async () => {
        const [top] = namedPile('scroll_wavy', 'scroll_flat')
        const named = baseNamer((own) => own)
        const queue = queueWith(named.provider)

        await queue.askPile(top!.id)
        await queue.askPile(top!.id)
        await queue.idle()
        await queue.askPile(top!.id)
        await queue.idle()

        expect(named.pileVariations).toHaveBeenCalledOnce()
        expect(base(top!.id)).toBe(OWN)
      })

      it("makes the base again from the top's own title when a mockup joins", async () => {
        const [top] = namedPile('scroll_wavy', 'scroll_flat')
        let asked = 0
        const named = baseNamer(() => (++asked === 1 ? 'Long scroll MacBook on sheets' : 'Long scroll MacBook'))
        const queue = queueWith(named.provider)
        await queue.askPile(top!.id)
        await queue.idle()
        expect(base(top!.id)).toBe('Long scroll MacBook on sheets')

        const desk = imported('scroll_desk', { aiStatus: 'ready', aiResult: result('desk') })
        repo.piles.addToPile(top!.id, [desk.id])
        repo.mockups.setStage([desk.id], 'to_stash')
        repo.drafts.ensureDraft(desk.id, { title: base(top!.id), description: '', tagIds: [] })
        await queue.askPile(top!.id)
        await queue.idle()

        expect(named.pileVariations.mock.calls.map((c) => c[1])).toEqual([OWN, OWN])
        expect(base(desk.id)).toBe('Long scroll MacBook')
      })

      it('asks no base for a pile in My Stash, whose name the person has seen', async () => {
        const rows = ['clay', 'realistic'].map((n) => imported(`watch-${n}`, { aiStatus: 'ready', aiResult: result(`Apple Watch ${n}`) }))
        repo.piles.createPile(rows.map((r) => r.id), rows[0]!.id)
        repo.mockups.setStage(rows.map((r) => r.id), 'stashed')
        const named = baseNamer(() => 'Apple Watch')
        const queue = queueWith(named.provider)

        await queue.askPile(rows[0]!.id)
        await queue.idle()

        expect(named.pileVariations.mock.calls[0]![1]).toBeUndefined()
        expect(repo.mockups.getMockup(rows[1]!.id)!.title).toBe('watch-realistic')
      })

      it("never gives the top's title to a model that doesn't name bases (the 4B)", async () => {
        const [top] = namedPile('scroll_wavy', 'scroll_flat')
        const named = baseNamer(() => 'Long scroll MacBook', false)
        const queue = queueWith(named.provider)

        await queue.askPile(top!.id)
        await queue.askPile(top!.id)
        await queue.idle()

        expect(named.pileVariations.mock.calls.map((c) => c[1])).toEqual([undefined])
        expect(base(top!.id)).toBe(OWN)
      })
    })
  })
})
