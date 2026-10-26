import {
  InferenceResultSchema,
  type AnalysisInput,
  type InferenceProvider,
  type InferenceResult
} from '@shared/inference'
import type { AiStatus } from '@shared/inbox'
import type { AiRun, AiStatusEvent, AiStatusUpdate } from '@shared/ipc/ai-status'
import type { Repository } from '../db/repository'
import type { Mockup } from '../db/schema'
import { HARD_STOP_FACTOR, RunTimes, memoryRunTimes } from './run-timing'

/**
 * What the provider is shown for a mockup: its cover, the file name it came in as, and the folders
 * around it. A variant in a pile is analysed alone. In round 3 B (design/research/ai-round3.md),
 * variants given the top's suggestion or approved words copied its scene, and its product names
 * alone made them no more consistent.
 */
export function analysisInputFor(m: Mockup): AnalysisInput {
  const ctx = m.importContext as { folderTrail?: string[]; originalFilename?: string } | null
  return {
    imagePath: m.coverPath,
    fileName: ctx?.originalFilename ?? m.title,
    folderTrail: ctx?.folderTrail ?? []
  }
}

export interface InferenceQueueDeps {
  repo: Repository
  /** The provider to use right now, or null when the AI is off or no model is installed. */
  getProvider: () => Promise<InferenceProvider | null>
  /** Called after every change of status, for the push event. */
  onStatus: (event: AiStatusEvent) => void
  /**
   * Readies a mockup's files before it is asked about: today, its design slot mask for one imported
   * before the mask was made at import. A failure only means the provider sees the cover as it is.
   */
  prepare?: (m: Mockup) => Promise<void>
  /** The active model's catalogue id, which this Mac's run times are kept under. */
  model?: () => string | null
  /** This Mac's recent run times, and the threshold for "taking a while" they give. Default: kept for this launch only. */
  timing?: RunTimes
  now?: () => number
  /** Calls `fire` after `ms`, and returns what clears it. Default: `setTimeout`. */
  timer?: (ms: number, fire: () => void) => () => void
}

const realTimer = (ms: number, fire: () => void) => {
  const t = setTimeout(fire, ms)
  return () => clearTimeout(t)
}

/** Tries per mockup: the first, and one retry. */
const ATTEMPTS = 2

/**
 * Makes AI suggestions in the background as files land: first in, first out, one at a time.
 * The status of every mockup is saved on its row, so after a restart `resume()` carries on.
 * The suggestion goes to `ai_result` and the mockup's own title and tags are left alone until
 * the user looks it over.
 */
export class InferenceQueue {
  private readonly fifo: number[] = []
  private current: number | null = null
  /** Where the current mockup's run is. */
  private run: AiRun | null = null
  /** Cancelled while being read: its answer is thrown away. */
  private readonly cancelled = new Set<number>()
  private pumping: Promise<void> | null = null

  private readonly timing: RunTimes
  private readonly now: () => number
  private readonly timer: NonNullable<InferenceQueueDeps['timer']>

  constructor(private readonly deps: InferenceQueueDeps) {
    this.timing = deps.timing ?? new RunTimes(memoryRunTimes())
    this.now = deps.now ?? Date.now
    this.timer = deps.timer ?? realTimer
  }

  /** Queue mockups for a suggestion. Ones that have one already, are in My Stash or Trash, or are gone are left out. */
  async enqueue(ids: number[]): Promise<void> {
    const provider = await this.deps.getProvider()
    const updates: AiStatusEvent['updates'] = []

    for (const id of new Set(ids)) {
      const m = this.deps.repo.mockups.getMockup(id)
      if (!m || !this.inInbox(m) || m.aiStatus === 'ready') continue
      if (!provider) {
        if (m.aiStatus !== 'off') updates.push(this.setStatus(id, 'off'))
        continue
      }
      // Asked for again after a cancel: let it run.
      this.cancelled.delete(id)
      if (this.fifo.includes(id) || this.current === id) continue
      this.fifo.push(id)
      if (m.aiStatus !== 'pending') updates.push(this.setStatus(id, 'pending'))
    }

    this.emit(updates)
    this.pump()
  }

  /** After a restart: queue everything that was waiting or half read, in the order it landed. */
  async resume(): Promise<void> {
    const waiting = this.deps.repo
      .inbox.getUnfinishedAiMockups()
      .sort((a, b) => a.id - b.id)
      .map((m) => m.id)
    await this.enqueue(waiting)
  }

  /** Stop work on mockups that were tossed or trashed. Whatever is queued is dropped. */
  cancel(ids: number[]): void {
    for (const id of new Set(ids)) {
      const at = this.fifo.indexOf(id)
      if (at !== -1) this.fifo.splice(at, 1)
      if (this.current === id) this.cancelled.add(id)
    }
  }

  /**
   * Put these mockups first, in this order: the one on screen in Look it over, then the rest of its
   * pile. The one being read finishes first, and ones not waiting their turn are left out.
   */
  prioritise(ids: number[]): void {
    const front = [...new Set(ids)].filter((id) => this.fifo.includes(id))
    if (front.length === 0) return
    const rest = this.fifo.filter((id) => !front.includes(id))
    this.fifo.splice(0, this.fifo.length, ...front, ...rest)
  }

  /**
   * Where one mockup is: waiting its turn (with the threshold, since the renderer counts a wait on
   * screen too), its run, or the status it ended with. Null when it is gone.
   */
  statusOf(id: number): AiStatusUpdate | null {
    if (this.current === id && this.run) return { mockupId: id, status: 'sniffing', run: this.run }
    if (this.fifo.includes(id)) {
      const slowAfterMs = this.timing.slowAfterMs(this.deps.model?.() ?? null)
      return { mockupId: id, status: 'pending', run: { phase: 'queued', writingSince: null, slowAfterMs } }
    }
    const m = this.deps.repo.mockups.getMockup(id)
    return m ? { mockupId: id, status: m.aiStatus } : null
  }

  /** Whether a suggestion is being read or waiting its turn. */
  get busy(): boolean {
    return this.pumping !== null || this.fifo.length > 0
  }

  /** Resolves when nothing is queued or running. */
  async idle(): Promise<void> {
    while (this.pumping) await this.pumping
  }

  private pump(): void {
    if (this.pumping) return
    this.pumping = this.drain().finally(() => {
      this.pumping = null
    })
  }

  private async drain(): Promise<void> {
    for (let id = this.fifo.shift(); id !== undefined; id = this.fifo.shift()) {
      this.current = id
      try {
        await this.process(id)
      } catch (err) {
        // Never let one mockup stop the queue.
        console.error('[AI] Queue error:', err)
      } finally {
        this.current = null
        this.run = null
        this.cancelled.delete(id)
      }
    }
  }

  private async process(id: number): Promise<void> {
    const m = this.deps.repo.mockups.getMockup(id)
    if (!m || !this.inInbox(m)) return

    const provider = await this.deps.getProvider()
    if (!provider) {
      this.emit([this.setStatus(id, 'off')])
      return
    }

    // The clock for "taking a while" starts once the model is loaded: a cold start says so instead.
    const model = this.deps.model?.() ?? null
    const slowAfterMs = this.timing.slowAfterMs(model)
    const cold = provider.loaded === false
    if (cold) {
      this.run = { phase: 'starting', writingSince: null, slowAfterMs }
      this.emit([{ ...this.setStatus(id, 'sniffing'), run: this.run }])
      // A load that fails leaves it to the request, which fails and is tried again.
      await provider.load?.().catch(() => {})
    }
    const since = this.now()
    this.run = { phase: 'writing', writingSince: since, slowAfterMs }
    this.emit([{ ...(cold ? { mockupId: id, status: 'sniffing' as const } : this.setStatus(id, 'sniffing')), run: this.run }])
    await this.deps.prepare?.(m).catch(() => {})
    const result = await this.suggestBy(provider, m, since + HARD_STOP_FACTOR * slowAfterMs)
    if (result && model) this.timing.record(model, this.now() - since)

    // Tossed or trashed while it was being read: nothing to write to.
    const now = this.deps.repo.mockups.getMockup(id)
    if (!now || now.deletedAt !== null) return
    if (this.cancelled.has(id)) {
      this.emit([this.setStatus(id, 'pending')])
      return
    }

    if (result) {
      this.deps.repo.mockups.updateMockup(id, { aiStatus: 'ready', aiResult: result })
      this.emit([{ mockupId: id, status: 'ready' }])
    } else {
      this.emit([this.setStatus(id, 'failed')])
    }
  }

  /**
   * The suggestion, or null when there is none by `stopAt` (the hard stop): the model is stopped so
   * the next mockup doesn't wait behind it, it isn't tried again, and its late answer goes nowhere.
   */
  private async suggestBy(provider: InferenceProvider, m: Mockup, stopAt: number): Promise<InferenceResult | null> {
    const run = { stopped: false }
    let clear = () => {}
    const stopped = new Promise<null>((resolve) => {
      clear = this.timer(Math.max(0, stopAt - this.now()), () => {
        run.stopped = true
        resolve(null)
      })
    })
    const result = await Promise.race([this.suggest(provider, m, run), stopped])
    clear()
    if (run.stopped) await provider.stop?.().catch(() => {})
    return run.stopped ? null : result
  }

  private async suggest(provider: InferenceProvider, m: Mockup, run: { stopped: boolean }): Promise<InferenceResult | null> {
    for (let attempt = 1; attempt <= ATTEMPTS && !run.stopped; attempt++) {
      try {
        const parsed = InferenceResultSchema.safeParse(await provider.analyze(analysisInputFor(m)))
        if (parsed.success) return parsed.data
      } catch {
        // Fall through to the next attempt.
      }
    }
    return null
  }

  private inInbox(m: Mockup): boolean {
    return m.deletedAt === null && m.stage !== 'stashed'
  }

  private setStatus(id: number, status: AiStatus): AiStatusEvent['updates'][number] {
    this.deps.repo.mockups.updateMockup(id, { aiStatus: status })
    return { mockupId: id, status }
  }

  private emit(updates: AiStatusEvent['updates']): void {
    if (updates.length === 0) return
    const { toSort, sniffing } = this.deps.repo.inbox.getCounts()
    this.deps.onStatus({ updates, totals: { total: toSort, remaining: sniffing } })
  }
}
