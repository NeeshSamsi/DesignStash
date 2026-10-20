import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import sharp from 'sharp'
import {
  InferenceResultSchema,
  type InferenceProvider,
  type InferenceResult
} from '@shared/inference'
import type {
  LookOverItem,
  LookOverProgress,
  LookOverQueue,
  LookOverUnit,
  SaveDraftRequest
} from '@shared/approval'
import { analysisInputFor } from '../ai/inference-service'
import type { Repository } from '../db/repository'
import type { Draft, Mockup } from '../db/schema'
import { TagService } from '../db/tag-service'

export interface LookOverDeps {
  exists: (path: string) => Promise<boolean>
  probe: (path: string) => Promise<{ width: number; height: number }>
}

const defaultDeps: LookOverDeps = {
  exists: (p) => fs.access(p).then(() => true, () => false),
  probe: async (p) => {
    const { width, height } = await sharp(p).metadata()
    if (!width || !height) throw new Error('No image size')
    return { width, height }
  }
}

interface Fields {
  title: string
  description: string
  tagIds: number[]
}

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((id, i) => id === [...b].sort((x, y) => x - y)[i])

const stemOf = (fileName: string) => fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()

/**
 * Look it over, on the main side. Everything the user does in a pile is a draft until Stash pile
 * (see `stash-service.ts`), so a mockup never reaches My Stash one at a time. The queue is piles
 * first, then mockups on their own, and suggestions come from the background AI queue's cache.
 */
export class LookOverService {
  private readonly deps: LookOverDeps
  private readonly tagService: TagService

  constructor(
    private readonly repo: Repository,
    private readonly getProvider: () => Promise<InferenceProvider | null>,
    deps?: Partial<LookOverDeps>,
    private readonly onProgress: (progress: LookOverProgress) => void = () => {},
    private readonly now: () => Date = () => new Date()
  ) {
    this.deps = { ...defaultDeps, ...deps }
    this.tagService = new TagService(repo)
  }

  async open(): Promise<LookOverQueue> {
    const provider = await this.getProvider()
    const units: LookOverUnit[] = []

    for (const root of this.repo.drafts.getQueueRoots()) {
      const members = root.isGroup ? this.members(root.id) : []
      const top = await this.draftFor(root, provider, null)
      const items = [await this.toItem(root, top, root.isGroup ? 'top' : 'single', root.isGroup ? root.id : null)]
      for (const member of members) {
        const draft = await this.draftFor(member, provider, top)
        items.push(await this.toItem(member, draft, 'variant', root.id))
      }
      units.push({ unitId: root.id, kind: root.isGroup ? 'pile' : 'single', items })
    }
    return { units, resume: this.validResume(units) }
  }

  async saveDraft(req: SaveDraftRequest): Promise<{ propagatedIds: number[] }> {
    const m = this.requireWaiting(req.mockupId)
    const before = await this.draftFor(m, null, null)
    const descriptionChanged = before.description !== req.description
    const tagsChanged = !sameIds(before.tagIds, req.tagIds)
    const changed = before.title !== req.title || descriptionChanged || tagsChanged

    this.repo.drafts.updateDraft(m.id, {
      title: req.title,
      description: req.description,
      tagIds: req.tagIds,
      checked: req.checked ?? true,
      ...(m.groupId !== null && changed ? { touched: true } : {})
    })

    if (!m.isGroup || !(descriptionChanged || tagsChanged)) return { propagatedIds: [] }
    return { propagatedIds: await this.carryToVariants(m, req) }
  }

  /** The drafts of a pile (top first) or of a mockup on its own, made if they were not yet. */
  async draftsFor(unitId: number): Promise<{ mockup: Mockup; draft: Draft }[]> {
    const root = this.requireWaiting(unitId)
    const provider = await this.getProvider()
    const top = await this.draftFor(root, provider, null)
    const out = [{ mockup: root, draft: top }]
    if (root.isGroup) {
      for (const member of this.members(root.id)) {
        out.push({ mockup: member, draft: await this.draftFor(member, provider, top) })
      }
    }
    return out
  }

  /** Skip for now: a mockup on its own goes to the end of the queue. Piles and their members stay put. */
  async skip(mockupId: number): Promise<{ skipped: boolean }> {
    const m = this.repo.getMockup(mockupId)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash' || m.isGroup || m.groupId !== null) {
      return { skipped: false }
    }
    await this.draftFor(m, null, null)
    this.repo.drafts.skip(m.id, this.now().toISOString())
    return { skipped: true }
  }

  /** Finish later: remember the step, so coming back resumes there. */
  async setResume(unitId: number, mockupId: number): Promise<{ saved: boolean }> {
    const root = this.repo.getMockup(unitId)
    if (!root || root.deletedAt !== null || root.stage !== 'to_stash' || root.groupId !== null) {
      return { saved: false }
    }
    const inUnit = mockupId === unitId || this.members(unitId).some((m) => m.id === mockupId)
    if (!inUnit) return { saved: false }
    this.repo.drafts.setResume(unitId, mockupId)
    return { saved: true }
  }

  // ---- drafts ----

  private members(pileId: number): Mockup[] {
    return this.repo
      .getMockupsByGroupId(pileId)
      .filter((m) => m.deletedAt === null && m.stage === 'to_stash')
      .sort((a, b) => a.id - b.id)
  }

  private requireWaiting(id: number): Mockup {
    const m = this.repo.getMockup(id)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash') {
      throw new Error(`Mockup ${id} is not waiting in To stash`)
    }
    return m
  }

  /** The draft for a mockup, made from its suggestion the first time it is needed. */
  private async draftFor(m: Mockup, provider: InferenceProvider | null, top: Draft | null): Promise<Draft> {
    const existing = this.repo.drafts.getDraft(m.id)
    if (existing) return existing
    return this.repo.drafts.ensureDraft(m.id, await this.defaults(m, provider, top))
  }

  private async defaults(m: Mockup, provider: InferenceProvider | null, top: Draft | null): Promise<Fields> {
    const input = analysisInputFor(m)
    const stem = stemOf(input.fileName) || m.title

    const cached = m.aiStatus === 'ready' ? InferenceResultSchema.safeParse(m.aiResult) : null
    let result: InferenceResult | null = cached?.success ? cached.data : null

    // A variant is filled from its top; only the top and mockups on their own are asked for a suggestion.
    if (!result && !top && provider) {
      try {
        result = await provider.analyze(input)
      } catch {
        result = null
      }
    }

    if (top) {
      return { title: result?.title ?? stem, description: top.description, tagIds: [...top.tagIds] }
    }
    if (!result) return { title: stem, description: '', tagIds: [] }
    return {
      title: result.title,
      description: result.description ?? '',
      tagIds: await this.tagService.snapTags(result.tags)
    }
  }

  /** Give variants that were not touched the top mockup's new description and tags. */
  private async carryToVariants(top: Mockup, req: SaveDraftRequest): Promise<number[]> {
    const variants = this.members(top.id)
    const targets: Mockup[] = []
    for (const v of variants) {
      const draft = await this.draftFor(v, null, this.repo.drafts.getDraft(top.id) ?? null)
      if (!draft.touched) targets.push(v)
    }
    if (targets.length === 0) return []

    const report = (completed: number, phase: LookOverProgress['phase']) =>
      this.onProgress({ pileId: top.id, completed, total: targets.length, phase })
    report(0, 'running')
    const done: number[] = []
    for (const v of targets) {
      this.repo.drafts.updateDraft(v.id, { description: req.description, tagIds: req.tagIds })
      done.push(v.id)
      if (done.length < targets.length) report(done.length, 'running')
    }
    report(done.length, 'done')
    return done
  }

  // ---- the queue ----

  private async toItem(
    m: Mockup,
    draft: Draft,
    role: LookOverItem['role'],
    pileId: number | null
  ): Promise<LookOverItem> {
    const missing = !(await this.deps.exists(m.coverPath))
    const size = missing ? null : await this.deps.probe(m.coverPath).catch(() => null)
    return {
      mockupId: m.id,
      pileId,
      role,
      title: draft.title,
      description: draft.description,
      tags: this.repo.getApprovalTagsByIds(draft.tagIds),
      touched: draft.touched,
      checked: draft.checked,
      cover: {
        path: m.coverPath,
        source: m.coverSource,
        missing,
        width: size?.width ?? null,
        height: size?.height ?? null
      },
      sidecarFileName: m.coverSource === 'sidecar' ? basename(m.coverPath) : null
    }
  }

  /** The saved pointer, if it still points at a step in the queue. A stale one is dropped. */
  private validResume(units: LookOverUnit[]): LookOverQueue['resume'] {
    for (let guard = 0; guard < 50; guard++) {
      const saved = this.repo.drafts.getResume()
      if (!saved) return null
      const unit = units.find((u) => u.unitId === saved.unitId)
      if (unit?.items.some((i) => i.mockupId === saved.mockupId)) return saved
      this.repo.drafts.clearResume(saved.unitId)
    }
    return null
  }
}
