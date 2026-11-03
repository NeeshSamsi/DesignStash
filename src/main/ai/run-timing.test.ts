import { describe, it, expect } from 'vitest'
import { MIN_RUNS, RECENT_RUNS, RunTimes, SLOW_LIMITS, slowAfterMs, type RunTimesStore } from './run-timing'

const limits = { floorMs: 10_000, ceilingMs: 60_000 }

describe('slowAfterMs', () => {
  it("is 2.5 times the median of this Mac's recent runs", () => {
    expect(slowAfterMs(limits, [8_000, 12_000, 30_000, 9_000, 10_000])).toBe(25_000)
  })

  it("stays within the model's floor and ceiling", () => {
    expect(slowAfterMs(limits, Array(5).fill(2_000))).toBe(10_000)
    expect(slowAfterMs(limits, Array(5).fill(40_000))).toBe(60_000)
  })

  it('is the ceiling until there are enough runs to go by', () => {
    expect(slowAfterMs(limits, Array(MIN_RUNS - 1).fill(8_000))).toBe(60_000)
  })

  it('has limits for every model in the catalogue that writes suggestions', () => {
    for (const id of ['apple', 'qwen3-vl-4b', 'qwen3.5-9b']) {
      const l = SLOW_LIMITS[id]!
      expect(l.floorMs).toBeLessThan(l.ceilingMs)
    }
  })
})

describe('RunTimes', () => {
  const memory = (): RunTimesStore & { saved: Record<string, number[]> } => {
    const store = {
      saved: {} as Record<string, number[]>,
      get: () => store.saved,
      set: (times: Record<string, number[]>) => {
        store.saved = times
      }
    }
    return store
  }

  it('keeps the last runs of each model, and goes by them', () => {
    const store = memory()
    const times = new RunTimes(store)
    for (let i = 1; i <= RECENT_RUNS + 3; i++) times.record('qwen3.5-9b', i * 1_000)
    times.record('apple', 2_000)

    expect(store.saved['qwen3.5-9b']).toHaveLength(RECENT_RUNS)
    expect(store.saved['qwen3.5-9b']![0]).toBe(4_000)
    expect(store.saved.apple).toEqual([2_000])
    expect(new RunTimes(store).slowAfterMs('qwen3.5-9b')).toBe(slowAfterMs(SLOW_LIMITS['qwen3.5-9b']!, store.saved['qwen3.5-9b']!))
  })

  it("gives a model outside the table, or none, the slowest model's limits", () => {
    const times = new RunTimes(memory())
    const slowest = Math.max(...Object.values(SLOW_LIMITS).map((l) => l.ceilingMs))
    expect(times.slowAfterMs('someone-elses-model')).toBe(slowest)
    expect(times.slowAfterMs(null)).toBe(slowest)
  })
})
