import {
  InferenceResultSchema,
  type AnalysisInput,
  type InferenceProvider,
  type InferenceResult
} from '@shared/inference'
import type { AiStatus } from '@shared/inbox'
import type { AiRun, AiStatusEvent, AiStatusUpdate } from '@shared/ipc/ai-status'
import { tidyWords } from '@shared/pile-variation'
import type { Repository } from '../db/repository'
import type { Mockup } from '../db/schema'
import { PileTitles } from '../library/pile-titles'
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
  /** A pile's variations landed (design L8): the mockups whose words or base changed. */
  onVariations?: (pileId: number, mockupIds: number[]) => void
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
  /** Stops the current run now, as the hard stop does (Fill it myself on the mockup being written). */
  private stopRun: (() => void) | null = null
  /** Piles waiting to be asked for their variations; they go before the next mockup, a request each. */
  private readonly piles: number[] = []
  /** The mockups each pile was last asked about, so it's asked again only once they change. */
  private readonly named = new Map<number, string>()
  /** The mockups and the top's own title each pile's base was last asked from, so a base is asked once for each. */
  private readonly based = new Map<number, string>()
  private pumping: Promise<void> | null = null

  private readonly timing: RunTimes
  private readonly now: () => number
  private readonly timer: NonNullable<InferenceQueueDeps['timer']>

  constructor(private readonly deps: InferenceQueueDeps) {
    this.timing = deps.timing ?? new RunTimes(memoryRunTimes())
    this.now = deps.now ?? Date.now
    this.timer = deps.timer ?? realTimer
  }

  /**
   * Queue mockups for a suggestion. Ones that have one already, that the person is filling in
   * themselves, that are in My Stash or Trash, or that are gone are left out.
   */
  async enqueue(ids: number[]): Promise<void> {
    await this.add(ids, false)
  }

  /**
   * Fill it myself (design L6.E1): no suggestion for this mockup, now or later, until Write
   * suggestions asks again. It leaves the queue, and a run on it now is stopped, so the queue moves
   * on. One whose suggestion already landed is left as it is.
   */
  optOut(id: number): void {
    const m = this.deps.repo.mockups.getMockup(id)
    if (!m || m.aiStatus === 'ready' || m.aiStatus === 'opted_out') return
    const at = this.fifo.indexOf(id)
    if (at !== -1) this.fifo.splice(at, 1)
    this.emit([this.setStatus(id, 'opted_out')])
    if (this.current === id) this.stopRun?.()
  }

  /** Write suggestions or Try again (L6.E1, L6.E3): queue again one the person filled in themselves or that couldn't be written. */
  async askAgain(id: number): Promise<void> {
    await this.add([id], true)
  }

  private async add(ids: number[], optedOutToo: boolean): Promise<void> {
    const provider = await this.deps.getProvider()
    const updates: AiStatusEvent['updates'] = []

    for (const id of new Set(ids)) {
      const m = this.deps.repo.mockups.getMockup(id)
      if (!m || !this.inInbox(m) || m.aiStatus === 'ready' || (m.aiStatus === 'opted_out' && !optedOutToo)) continue
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
   * screen too, and while its files are readied), its run, or the status it ended with. Null when
   * it is gone.
   */
  statusOf(id: number): AiStatusUpdate | null {
    if (this.current === id && this.run) return { mockupId: id, status: 'sniffing', run: this.run }
    if (this.fifo.includes(id) || this.current === id) {
      const slowAfterMs = this.timing.slowAfterMs(this.deps.model?.() ?? null)
      return { mockupId: id, status: 'pending', run: { phase: 'queued', writingSince: null, slowAfterMs } }
    }
    const m = this.deps.repo.mockups.getMockup(id)
    return m ? { mockupId: id, status: m.aiStatus } : null
  }

  /**
   * Ask a pile for its variations (design L8), once nothing in it is waiting for its own suggestion
   * and its titles are kept (drafts in To stash, its mockups in My Stash), with a model that names
   * them. A pile is asked again only when its mockups have changed since, as when one joins, and
   * while one of them still has only the fallback's words or none. With a model that names bases
   * (the 9B), it is also asked while its base is still its top's own title, once for that title.
   */
  async askPile(pileId: number): Promise<void> {
    const provider = await this.deps.getProvider()
    if (!provider?.pileVariations || !this.wantsVariations(pileId, provider)) return
    if (!this.piles.includes(pileId)) this.piles.push(pileId)
    this.pump()
  }

  /** Whether a suggestion is being read or waiting its turn. */
  get busy(): boolean {
    return this.pumping !== null || this.fifo.length > 0 || this.piles.length > 0
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
    for (;;) {
      const pileId = this.piles.shift()
      if (pileId !== undefined) {
        // Never let one pile stop the queue.
        await this.namePile(pileId).catch((err: unknown) => console.error('[AI] Could not name a pile:', err))
        continue
      }
      const id = this.fifo.shift()
      if (id === undefined) return
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
      // The pile's own suggestions are in once its last mockup is done: its variations come next.
      const m = this.deps.repo.mockups.getMockup(id)
      const pile = m ? (m.isGroup ? m.id : m.groupId) : null
      if (pile !== null) await this.askPile(pile)
    }
  }

  /**
   * A pile's mockups in pile order (the top first, then the rest by id), each with where its
   * variation came from, as `PileTitles` keeps them. Null when its titles aren't kept yet: in To
   * sort, or in To stash before Look it over made the top's draft.
   */
  private pileMembers(pileId: number): { mockup: Mockup; source: string | null }[] | null {
    const { repo } = this.deps
    const top = repo.mockups.getMockup(pileId)
    if (!top?.isGroup || top.deletedAt !== null || top.stage === 'to_sort') return null
    const members = [top, ...repo.piles.getMockupsByGroupId(pileId).sort((a, b) => a.id - b.id)].filter(
      (m) => m.deletedAt === null && m.stage === top.stage
    )
    if (top.stage === 'stashed') return members.map((m) => ({ mockup: m, source: m.variationSource }))
    const drafts = repo.drafts.getDrafts(members.map((m) => m.id))
    if (!drafts.has(top.id)) return null
    return members.flatMap((m) => {
      const d = drafts.get(m.id)
      return d ? [{ mockup: m, source: d.variationSource }] : []
    })
  }

  private wantsVariations(pileId: number, provider: InferenceProvider): boolean {
    const pile = this.pileMembers(pileId)
    if (!pile || pile.length < 2) return false
    const writing = (m: Mockup) => this.fifo.includes(m.id) || this.current === m.id || m.aiStatus === 'pending' || m.aiStatus === 'sniffing'
    if (pile.some((p) => writing(p.mockup))) return false
    const ids = pile.map((p) => p.mockup.id).join(',')
    // Still to name: a mockup with no words, or only the fallback's.
    if (this.named.get(pileId) !== ids && pile.some((p) => p.source !== 'ai' && p.source !== 'typed')) return true
    // Or a base that is still the top's own title, not yet asked from with these mockups.
    const base = this.baseFrom(pileId, provider)
    return base !== null && base.now === tidyWords(base.topTitle) && this.based.get(pileId) !== `${ids}\n${base.topTitle}`
  }

  /**
   * The top's own suggested title, for a model that names bases (the 9B), while the pile's base can
   * take the AI's: the pile waits in To stash, nobody typed its base, and the top's suggestion has
   * landed in its draft (until then Look it over would write the top's title over the base). With
   * the base as it is now. Null otherwise: a pile in My Stash keeps the name the person saw.
   */
  private baseFrom(pileId: number, provider: InferenceProvider): { topTitle: string; now: string } | null {
    if (!provider.pileBase) return null
    const top = this.deps.repo.mockups.getMockup(pileId)
    if (!top?.isGroup || top.deletedAt !== null || top.stage !== 'to_stash' || top.aiStatus !== 'ready') return null
    const draft = this.deps.repo.drafts.getDraft(pileId)
    if (!draft || draft.awaitingAi || draft.keptFields.includes('title')) return null
    const own = InferenceResultSchema.safeParse(top.aiResult)
    return own.success ? { topTitle: own.data.title, now: tidyWords(draft.title) } : null
  }

  /**
   * One request for a pile's variations, landed by `PileTitles.landAi`: typed words stay, "same" or
   * no answer takes the fallback, and words the app gives twice get a number. With a model that
   * names bases, the same request gives the pile's base from its top's own title, which renames
   * every mockup in it unless the person typed a base meanwhile. A request that fails leaves the
   * fallback and the base; one stuck past the hard stop is stopped, and the queue moves on.
   */
  private async namePile(pileId: number): Promise<void> {
    const provider = await this.deps.getProvider()
    const pile = this.pileMembers(pileId)
    if (!provider?.pileVariations || !pile || pile.length < 2) return
    const ids = pile.map((p) => p.mockup.id).join(',')
    this.named.set(pileId, ids)
    const topTitle = this.baseFrom(pileId, provider)?.topTitle
    if (topTitle !== undefined) this.based.set(pileId, `${ids}\n${topTitle}`)
    const slowAfterMs = this.timing.slowAfterMs(this.deps.model?.() ?? null)
    let stuck = false
    let clear = () => {}
    const stopped = new Promise<null>((resolve) => {
      clear = this.timer(HARD_STOP_FACTOR * slowAfterMs, () => {
        stuck = true
        resolve(null)
      })
    })
    const asked = provider.pileVariations(
      pile.map((p) => ({ coverPath: p.mockup.coverPath, fileName: analysisInputFor(p.mockup).fileName })),
      topTitle
    )
    const named = await Promise.race([asked.catch(() => null), stopped])
    clear()
    if (stuck) await provider.stop?.().catch(() => {})
    if (!named) return
    const titles = new PileTitles(this.deps.repo)
    const changed = new Set(titles.landAi(pileId, new Map(pile.map((p, i) => [p.mockup.id, named.variations[i] ?? null]))))
    if (named.base !== null && topTitle !== undefined && this.baseFrom(pileId, provider)?.topTitle === topTitle) {
      for (const id of titles.renameBase(pileId, named.base, 'ai').mockupIds) changed.add(id)
    }
    if (changed.size > 0) this.deps.onVariations?.(pileId, [...changed])
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
    // Readying its files (the slot mask) is no part of the model's run: the clock starts after.
    await this.deps.prepare?.(m).catch(() => {})
    // Filled in by the person while the model loaded or the files were readied: nothing to ask.
    if (this.deps.repo.mockups.getMockup(id)?.aiStatus === 'opted_out') return
    const since = this.now()
    this.run = { phase: 'writing', writingSince: since, slowAfterMs }
    this.emit([{ ...(cold ? { mockupId: id, status: 'sniffing' as const } : this.setStatus(id, 'sniffing')), run: this.run }])
    const result = await this.suggestBy(provider, m, since + HARD_STOP_FACTOR * slowAfterMs)

    // Tossed or trashed while it was being read: nothing to write to. Filled in by the person: theirs.
    const now = this.deps.repo.mockups.getMockup(id)
    if (!now || now.deletedAt !== null || now.aiStatus === 'opted_out') return
    if (result && model) this.timing.record(model, this.now() - since)
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
      const stop = () => {
        run.stopped = true
        resolve(null)
      }
      this.stopRun = stop
      clear = this.timer(Math.max(0, stopAt - this.now()), stop)
    })
    const result = await Promise.race([this.suggest(provider, m, run), stopped])
    clear()
    this.stopRun = null
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
