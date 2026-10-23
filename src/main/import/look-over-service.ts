import { promises as fs } from 'node:fs'
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
import { analysisInputFor } from '../ai/inference-queue'
import type { Repository } from '../db/repository'
import type { Draft, DraftField, Mockup } from '../db/schema'
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

/** A new draft: its fields, and whether they are a fallback until the AI's suggestion lands. */
interface Defaults extends Fields {
  awaitingAi: boolean
}

/** The background queue is reading it, or will. */
const aiWorking = (m: Mockup) => m.aiStatus === 'pending' || m.aiStatus === 'sniffing'

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((id, i) => id === [...b].sort((x, y) => x - y)[i])

/** The title a mockup gets when there is no suggestion: its file name without the extension. */
export const stemOf = (fileName: string) => fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()

/**
 * Look it over, on the main side. Everything the user does in a pile is a draft until Stash pile
 * (see `stash-service.ts`), so a mockup never reaches My Stash one at a time. The queue is piles
 * first, then mockups on their own, and suggestions come from the background AI queue's cache.
 * A draft made before its suggestion is ready waits for it: `settle` fills it in when it lands.
 */
export class LookOverService {
  private readonly deps: LookOverDeps
  private readonly tagService: TagService
  /** Told which parts of a suggestion a save changed (names only, never the text). Set by the IPC layer for telemetry. */
  onEdited: (fields: ('title' | 'description' | 'tags')[]) => void = () => {}

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

    const edited: DraftField[] = [
      ...(before.title !== req.title ? (['title'] as const) : []),
      ...(descriptionChanged ? (['description'] as const) : []),
      ...(tagsChanged ? (['tags'] as const) : [])
    ]
    if (changed) this.onEdited(edited)

    this.repo.drafts.updateDraft(m.id, {
      title: req.title,
      description: req.description,
      tagIds: req.tagIds,
      checked: req.checked ?? true,
      keptFields: keep(before, edited),
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
    const m = this.repo.mockups.getMockup(mockupId)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash' || m.isGroup || m.groupId !== null) {
      return { skipped: false }
    }
    await this.draftFor(m, null, null)
    this.repo.drafts.skip(m.id, this.now().toISOString())
    return { skipped: true }
  }

  /** Finish later: remember the step, so coming back resumes there. */
  async setResume(unitId: number, mockupId: number): Promise<{ saved: boolean }> {
    const root = this.repo.mockups.getMockup(unitId)
    if (!root || root.deletedAt !== null || root.stage !== 'to_stash' || root.groupId !== null) {
      return { saved: false }
    }
    const inUnit = mockupId === unitId || this.members(unitId).some((m) => m.id === mockupId)
    if (!inUnit) return { saved: false }
    this.repo.drafts.setResume(unitId, mockupId)
    return { saved: true }
  }

  /**
   * The background queue finished a mockup (ready, failed or off). A draft waiting for its
   * suggestion takes it, in every field the user hasn't edited and a carry-over hasn't set, and
   * stops waiting. Returns the updated item for the open flow, or null when nothing changed.
   */
  async settle(mockupId: number): Promise<LookOverItem | null> {
    const m = this.repo.mockups.getMockup(mockupId)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash') return null
    const draft = this.repo.drafts.getDraft(m.id)
    if (!draft?.awaitingAi) return null
    const settled = await this.settled(m, draft)
    if (settled.awaitingAi) return null
    const role = m.isGroup ? 'top' : m.groupId !== null ? 'variant' : 'single'
    return this.toItem(m, settled, role, m.isGroup ? m.id : m.groupId)
  }

  // ---- drafts ----

  private members(pileId: number): Mockup[] {
    return this.repo
      .piles.getMockupsByGroupId(pileId)
      .filter((m) => m.deletedAt === null && m.stage === 'to_stash')
      .sort((a, b) => a.id - b.id)
  }

  private requireWaiting(id: number): Mockup {
    const m = this.repo.mockups.getMockup(id)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash') {
      throw new Error(`Mockup ${id} is not waiting in To stash`)
    }
    return m
  }

  /**
   * The draft for a mockup, made the first time it is needed. One still waiting for the AI is
   * settled first, in case its suggestion landed while nothing was listening.
   */
  private async draftFor(m: Mockup, provider: InferenceProvider | null, top: Draft | null): Promise<Draft> {
    const existing = this.repo.drafts.getDraft(m.id)
    if (existing) return existing.awaitingAi ? this.settled(m, existing) : existing
    return this.repo.drafts.ensureDraft(m.id, await this.defaults(m, provider, top))
  }

  /**
   * A new draft's fields: the mockup's own suggestion, title, description and snapped tags alike.
   * Only a top or a mockup on its own is ever asked for one here; variants are left to the
   * background queue, because a pile of them on a slow model would hold up opening the pile.
   * Without a suggestion it falls back to the file name, and a variant to its top's description
   * and tags, and it waits for the AI if the queue is still on it.
   */
  private async defaults(m: Mockup, provider: InferenceProvider | null, top: Draft | null): Promise<Defaults> {
    const input = analysisInputFor(m)
    let result = this.cachedSuggestion(m)

    if (!result && !top && provider) {
      try {
        result = await provider.analyze(input)
      } catch {
        result = null
      }
    }

    if (result) return { ...(await this.fieldsFrom(result)), awaitingAi: false }
    return {
      title: stemOf(input.fileName) || m.title,
      description: top?.description ?? '',
      tagIds: top ? [...top.tagIds] : [],
      awaitingAi: aiWorking(m)
    }
  }

  /** A waiting draft once the queue is done with its mockup: the suggestion in its open fields, or the fallback kept. */
  private async settled(m: Mockup, draft: Draft): Promise<Draft> {
    const result = this.cachedSuggestion(m)
    if (!result && aiWorking(m)) return draft
    const patch: Partial<Fields> = {}
    if (result) {
      const fields = await this.fieldsFrom(result)
      const kept = new Set(draft.keptFields)
      if (!kept.has('title')) patch.title = fields.title
      if (!kept.has('description')) patch.description = fields.description
      if (!kept.has('tags')) patch.tagIds = fields.tagIds
    }
    this.repo.drafts.updateDraft(m.id, { ...patch, awaitingAi: false })
    return this.repo.drafts.getDraft(m.id)!
  }

  private cachedSuggestion(m: Mockup): InferenceResult | null {
    if (m.aiStatus !== 'ready') return null
    const cached = InferenceResultSchema.safeParse(m.aiResult)
    return cached.success ? cached.data : null
  }

  private async fieldsFrom(result: InferenceResult): Promise<Fields> {
    return {
      title: result.title,
      description: result.description ?? '',
      tagIds: await this.tagService.snapTags(result.tags)
    }
  }

  /** Apply the top's edit to its variants, as `carriedEdit` decides for each, and say how far it got. */
  private async carryToVariants(top: Mockup, req: SaveDraftRequest): Promise<number[]> {
    const topDraft = this.repo.drafts.getDraft(top.id) ?? null
    const targets: { id: number; draft: Draft; patch: Pick<Fields, 'description' | 'tagIds'> }[] = []
    for (const v of this.members(top.id)) {
      const draft = await this.draftFor(v, null, topDraft)
      const patch = carriedEdit(draft, req)
      if (patch) targets.push({ id: v.id, draft, patch })
    }
    if (targets.length === 0) return []

    const report = (completed: number, phase: LookOverProgress['phase']) =>
      this.onProgress({ pileId: top.id, completed, total: targets.length, phase })
    report(0, 'running')
    const done: number[] = []
    for (const { id, draft, patch } of targets) {
      this.repo.drafts.updateDraft(id, { ...patch, keptFields: keep(draft, ['description', 'tags']) })
      done.push(id)
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
      tags: this.repo.tags.getApprovalTagsByIds(draft.tagIds),
      touched: draft.touched,
      checked: draft.checked,
      waitingForAi: draft.awaitingAi,
      cover: {
        path: m.coverPath,
        source: m.coverSource,
        missing,
        width: size?.width ?? null,
        height: size?.height ?? null
      }
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

/**
 * What a variant takes from an edit to its pile's top: today the top's description and tags, for
 * every variant the user hasn't touched, and nothing for one they have. The one place that
 * decides, so it can become a judged step later.
 */
export function carriedEdit(
  variant: Pick<Draft, 'touched'>,
  edit: Pick<SaveDraftRequest, 'description' | 'tagIds'>
): Pick<Fields, 'description' | 'tagIds'> | null {
  if (variant.touched) return null
  return { description: edit.description, tagIds: [...edit.tagIds] }
}

/** A draft's kept fields with these added. */
const keep = (draft: Pick<Draft, 'keptFields'>, fields: DraftField[]): DraftField[] => [
  ...new Set([...draft.keptFields, ...fields])
]
