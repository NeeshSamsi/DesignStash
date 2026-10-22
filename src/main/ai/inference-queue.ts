import {
  InferenceResultSchema,
  type AnalysisInput,
  type InferenceProvider,
  type InferenceResult
} from '@shared/inference'
import type { AiStatus } from '@shared/inbox'
import type { AiStatusEvent } from '@shared/ipc/ai-status'
import type { Repository } from '../db/repository'
import type { Mockup } from '../db/schema'

/**
 * What the provider is shown for a mockup: its cover, the file name it came in as, and the folders
 * around it. With `repo`, a variant whose pile's first mockup is already stashed also gets that
 * mockup's approved title, description and tags, so it is described the same way.
 */
export function analysisInputFor(m: Mockup, repo?: Repository): AnalysisInput {
  const ctx = m.importContext as { folderTrail?: string[]; originalFilename?: string } | null
  const groupContext = repo ? pileContextFor(m, repo) : null
  return {
    imagePath: m.coverPath,
    fileName: ctx?.originalFilename ?? m.title,
    folderTrail: ctx?.folderTrail ?? [],
    ...(groupContext && { groupContext })
  }
}

function pileContextFor(m: Mockup, repo: Repository): AnalysisInput['groupContext'] | null {
  if (m.groupId === null) return null
  const top = repo.mockups.getMockup(m.groupId)
  if (!top || top.stage !== 'stashed' || top.deletedAt !== null) return null
  const categories = new Map(repo.tags.getAllCategories().map((c) => [c.id, c.label]))
  return {
    originalTitle: top.title,
    originalDescription: top.description ?? '',
    originalTags: repo.mockups
      .getTagsForMockup(top.id)
      .map((t) => ({ category: categories.get(t.categoryId) ?? '', label: t.label }))
  }
}

export interface InferenceQueueDeps {
  repo: Repository
  /** The provider to use right now, or null when the AI is off or no model is installed. */
  getProvider: () => Promise<InferenceProvider | null>
  /** Called after every change of status, for the push event. */
  onStatus: (event: AiStatusEvent) => void
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
  /** Cancelled while being read: its answer is thrown away. */
  private readonly cancelled = new Set<number>()
  private pumping: Promise<void> | null = null

  constructor(private readonly deps: InferenceQueueDeps) {}

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

    this.emit([this.setStatus(id, 'sniffing')])
    const result = await this.suggest(provider, m)

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

  private async suggest(provider: InferenceProvider, m: Mockup): Promise<InferenceResult | null> {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const parsed = InferenceResultSchema.safeParse(await provider.analyze(analysisInputFor(m, this.deps.repo)))
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
