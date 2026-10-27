import type { Repository } from '../db/repository'
import type { MeaningEmbedder } from './embedder'
import { MEANING_MODEL_ID, cosine, documentHash } from './meaning'

export interface EmbeddingServiceDeps {
  repo: Pick<Repository, 'embeddings' | 'search'>
  /** Whether the model is on disk and the runtime exists. When false the service does nothing. */
  available(): boolean
  /** Builds the embedder on first use, so no process starts until there is work. */
  embedder(): MeaningEmbedder
  /** True while AI suggestions are running; indexing waits for them to finish. */
  isBusy?: () => boolean
  sleep?(ms: number): Promise<void>
  log?(message: string, err: unknown): void
}

const BATCH = 8
const BUSY_POLL_MS = 2_000
/** The waits after a failed batch before the next try: then a mockup that failed every try waits for the next backfill. */
const RETRY_AFTER_MS = [30_000, 120_000]
/** A short wait before the first batch, so a burst of changes (a rebuild, a bulk tag edit) is one batch. */
const SETTLE_MS = 100

/**
 * Keeps one meaning vector per stashed mockup current, and answers "how close is each mockup to
 * this search". Work is queued: a changed mockup is embedded in the background, in batches, behind
 * AI suggestions, and only when the hash of its text differs from the stored one.
 */
export class EmbeddingService {
  /** Mockups waiting for a vector, with the text to embed. Insertion order is the work order. */
  private readonly pending = new Map<number, string>()
  /** Failed tries per queued mockup (F-027). */
  private readonly tries = new Map<number, number>()
  private pumping: Promise<void> | null = null
  private cache: Map<number, Float32Array> | null = null
  private embedderInstance: MeaningEmbedder | null = null
  private stopped = false

  constructor(private readonly deps: EmbeddingServiceDeps) {}

  /** Set after construction, because the suggestion queue is built from the handler context. */
  setBusyCheck(isBusy: (() => boolean) | undefined): void {
    if (isBusy) this.deps.isBusy = isBusy
    else delete this.deps.isBusy
  }

  private get embedder(): MeaningEmbedder {
    return (this.embedderInstance ??= this.deps.embedder())
  }

  /** A mockup was indexed with this text: queue a vector for it unless the stored one is current. */
  documentChanged(mockupId: number, text: string): void {
    if (this.stopped || !this.deps.available() || text === '') return
    if (this.deps.repo.embeddings.hashOf(mockupId, MEANING_MODEL_ID) === documentHash(text)) return
    this.pending.delete(mockupId)
    this.pending.set(mockupId, text)
    this.pump()
  }

  /** Queue every stashed mockup that has no current vector. Cheap when all are current. */
  backfill(): void {
    if (this.stopped) return
    const documents = (() => {
      try {
        return this.deps.repo.search.meaningDocuments()
      } catch {
        // The database is closed (the app is quitting): there is nothing left to catch up on.
        return []
      }
    })()
    for (const { id, text } of documents) this.documentChanged(id, text)
  }

  /** Resolves when the queue is empty. */
  async idle(): Promise<void> {
    while (this.pumping) await this.pumping
  }

  private pump(): void {
    if (this.pumping) return
    this.pumping = this.drain().finally(() => {
      this.pumping = null
      if (this.pending.size > 0 && !this.stopped) this.pump()
    })
  }

  private async drain(): Promise<void> {
    const sleep = this.deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
    await sleep(SETTLE_MS)
    while (this.pending.size > 0 && !this.stopped) {
      while (this.deps.isBusy?.()) await sleep(BUSY_POLL_MS)
      const batch = [...this.pending].slice(0, BATCH)
      for (const [id] of batch) this.pending.delete(id)
      // A mockup trashed or removed since it was queued has no place in the index.
      const live = batch.filter(([id]) => this.deps.repo.search.isIndexed(id))
      if (live.length === 0) continue
      try {
        const vectors = await this.embedder.embedDocuments(live.map(([, text]) => text))
        live.forEach(([id, text], i) => {
          this.tries.delete(id)
          if (!this.deps.repo.search.isIndexed(id)) return
          this.deps.repo.embeddings.upsert(id, MEANING_MODEL_ID, vectors[i]!, documentHash(text))
        })
        this.cache = null
      } catch (err) {
        await this.failed(live, err, sleep)
      }
    }
  }

  /**
   * A batch that failed goes to the back of the queue, so the ones behind it still run, after a
   * wait that grows with its tries (F-027). A mockup that failed every try is left to the next
   * backfill: the next launch, or the model finishing its download.
   */
  private async failed(batch: [number, string][], err: unknown, sleep: (ms: number) => Promise<void>): Promise<void> {
    let worst = 0
    for (const [id, text] of batch) {
      const tries = (this.tries.get(id) ?? 0) + 1
      worst = Math.max(worst, tries)
      if (tries > RETRY_AFTER_MS.length) {
        this.tries.delete(id)
        continue
      }
      this.tries.set(id, tries)
      // A newer text queued meanwhile wins.
      if (!this.pending.has(id)) this.pending.set(id, text)
    }
    const wait = RETRY_AFTER_MS[worst - 1]
    if (wait === undefined) {
      this.deps.log?.('Could not embed a batch for meaning search; it waits for the next backfill', err)
      return
    }
    this.deps.log?.(`Could not embed a batch for meaning search; trying it again in ${wait / 1000} s`, err)
    await sleep(wait)
  }

  /**
   * How close each mockup is to a search, by cosine, or null when meaning search can't answer
   * (no model, no vectors yet, or the embedder failed): the caller then shows keyword results only.
   */
  async similarities(query: string): Promise<Map<number, number> | null> {
    if (this.stopped || !this.deps.available()) return null
    try {
      const vectors = (this.cache ??= this.deps.repo.embeddings.vectors(MEANING_MODEL_ID))
      if (vectors.size === 0) return null
      const q = await this.embedder.embedQuery(query)
      return new Map([...vectors].map(([id, v]) => [id, cosine(q, v)]))
    } catch (err) {
      this.deps.log?.('Meaning search failed for a query', err)
      return null
    }
  }

  /** The model was deleted: forget what was queued and cached, and stop its server. */
  async modelRemoved(): Promise<void> {
    this.pending.clear()
    this.cache = null
    this.deps.repo.embeddings.removeModel(MEANING_MODEL_ID)
    await this.embedderInstance?.stop()
    this.embedderInstance = null
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.pending.clear()
    await this.embedderInstance?.stop()
  }
}
