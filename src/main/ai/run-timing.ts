/**
 * When a suggestion counts as "taking a while" (design L6.4): about 2.5 times the median of this
 * Mac's recent runs of the model, within the model's floor and ceiling. Base M1 and M2 Macs run
 * several times slower than the M3 Max the limits were measured on, so the threshold comes from the
 * Mac's own runs; the floor keeps a fast Mac's quick runs from making every ordinary one look slow,
 * and the ceiling keeps a run that is truly stuck from waiting minutes for its notice. The clock
 * starts when the model begins on the mockup, after any model load (round 3 A9,
 * design/research/ai-round3.md).
 */

/** A model's limits for "taking a while", ms. */
export interface SlowLimits {
  floorMs: number
  ceilingMs: number
}

export const SLOW_FACTOR = 2.5
/**
 * At this many times the threshold the run is stopped and the mockup can't be written (L6.E3), so
 * one stuck run can't hold up the queue (Neesh, 2026-10-26).
 */
export const HARD_STOP_FACTOR = 3
/** Runs kept per model. */
export const RECENT_RUNS = 20
/** With fewer runs than this the median says too little about the Mac, so the ceiling stands. */
export const MIN_RUNS = 5

/**
 * By catalogue id, from round 3 D's runs on an M3 Max: the floor is the longest normal answer
 * there, rounded up to 5 s, and the ceiling about twice what a base M1 or M2 takes for a typical one.
 */
export const SLOW_LIMITS: Record<string, SlowLimits> = {
  apple: { floorMs: 5_000, ceilingMs: 10_000 },
  'qwen3-vl-4b': { floorMs: 20_000, ceilingMs: 60_000 },
  'qwen3.5-9b': { floorMs: 35_000, ceilingMs: 100_000 }
}

/** A model outside the table, or none: the slowest model's limits. */
const UNKNOWN: SlowLimits = Object.values(SLOW_LIMITS).reduce((a, b) => (b.ceilingMs > a.ceilingMs ? b : a))

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** How long a run may write before it counts as taking a while, given this Mac's recent runs of the model. */
export function slowAfterMs(limits: SlowLimits, recent: readonly number[]): number {
  if (recent.length < MIN_RUNS) return limits.ceilingMs
  return Math.min(limits.ceilingMs, Math.max(limits.floorMs, Math.round(SLOW_FACTOR * median(recent))))
}

/** Where the recent run times live: the settings file, so a new launch starts from this Mac's speed. */
export interface RunTimesStore {
  get(): Record<string, number[]>
  set(times: Record<string, number[]>): void
}

/** This Mac's recent run times per model, and the threshold they give. */
export class RunTimes {
  constructor(private readonly store: RunTimesStore) {}

  /** A run that wrote a suggestion, timed from when the model began on it. */
  record(model: string, ms: number): void {
    const times = this.store.get()
    this.store.set({ ...times, [model]: [...(times[model] ?? []), Math.round(ms)].slice(-RECENT_RUNS) })
  }

  slowAfterMs(model: string | null): number {
    const limits = (model && SLOW_LIMITS[model]) || UNKNOWN
    return slowAfterMs(limits, (model && this.store.get()[model]) || [])
  }
}

/** A store that keeps the times for this launch only. */
export function memoryRunTimes(): RunTimesStore {
  let times: Record<string, number[]> = {}
  return {
    get: () => times,
    set: (next) => {
      times = next
    }
  }
}
