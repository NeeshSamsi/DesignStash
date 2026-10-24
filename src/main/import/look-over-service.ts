import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import {
  InferenceResultSchema,
  type InferenceProvider,
  type InferenceResult,
  type PileEdit,
  type PileEditEntry,
  type PileEditSteps
} from '@shared/inference'
import type {
  AnswerEditRequest,
  LookOverCarry,
  LookOverItem,
  LookOverProgress,
  LookOverQueue,
  LookOverUnit,
  SaveDraftRequest
} from '@shared/approval'
import { analysisInputFor } from '../ai/inference-queue'
import { editDiff, editReaches } from '../ai/pile-edit'
import type { Repository } from '../db/repository'
import type { CarryState, Draft, DraftCarry, DraftField, DraftWords, Mockup } from '../db/schema'
import { TagService } from '../db/tag-service'

export interface LookOverDeps {
  exists: (path: string) => Promise<boolean>
  probe: (path: string) => Promise<{ width: number; height: number }>
  /** How long a model may judge one edit to a pile top before every variant it hasn't judged gets the offer (design L7.E4). */
  judgeMs: number
  /** How long the rewrite for one variant may take before the top's description stands in. */
  rewriteMs: number
}

const defaultDeps: LookOverDeps = {
  exists: (p) => fs.access(p).then(() => true, () => false),
  probe: async (p) => {
    const { width, height } = await sharp(p).metadata()
    if (!width || !height) throw new Error('No image size')
    return { width, height }
  },
  judgeMs: 20_000,
  rewriteMs: 20_000
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

const sameWords = (a: DraftWords, b: DraftWords) => a.description === b.description && sameIds(a.tagIds, b.tagIds)

/** A variant's own tags with only an edit's tag changes made: the tags it added added, the ones it took out taken out. */
export function changedTagIds(own: number[], top: DraftCarry['top']): number[] {
  const added = top.after.tagIds.filter((id) => !top.before.tagIds.includes(id))
  const removed = new Set(top.before.tagIds.filter((id) => !top.after.tagIds.includes(id)))
  const kept = own.filter((id) => !removed.has(id))
  return [...kept, ...added.filter((id) => !kept.includes(id))]
}

/** The promise, or a rejection once `ms` have passed. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out')), Math.max(0, ms))
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** What judging one variant came to. */
type Verdict = { take: Prepared } | { offer: string | null; prepared?: Prepared }
type Prepared = NonNullable<DraftCarry['prepared']>

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
  /** Told when background work changes a variant (judged, offered, a version prepared). Set by the IPC layer for the `look-over:draft` push. */
  onItem: (item: LookOverItem) => void = () => {}
  /** Piles whose edit is being judged here, with the run's number: a newer edit starts a new run, and the older one's answers are dropped. */
  private readonly runs = new Map<number, number>()
  private lastRun = 0
  /** The version being prepared for a variant, so accepting waits for it. */
  private readonly preparing = new Map<number, Promise<void>>()
  /** Background work for pile edits, one step at a time (the model answers one request at a time). */
  private work: Promise<void> = Promise.resolve()

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
        const draft = this.unstuck(root.id, await this.draftFor(member, provider, top))
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
      // A variant the person edits is theirs: edits to the top leave it alone from now on.
      ...(m.groupId !== null && changed ? { touched: true, carry: null } : {})
    })

    if (!m.isGroup || !(descriptionChanged || tagsChanged)) return { propagatedIds: [] }
    return { propagatedIds: await this.carryEdit(m, before, req) }
  }

  /** The person's answer to the top's edit on one variant, from `look-over:answer-edit`. */
  answerEdit({ mockupId, action }: AnswerEditRequest): Promise<LookOverItem | null> {
    if (action === 'accept') return this.acceptEdit(mockupId)
    if (action === 'undo') return this.undoEdit(mockupId)
    if (action === 'dismiss') return this.dismissEdit(mockupId)
    return this.restoreEdit(mockupId)
  }

  /**
   * Accept the offered edit on one variant: it takes the version the preview shows (waiting for
   * one still being prepared) and only the edit's tag changes. Null when nothing is on offer.
   */
  async acceptEdit(mockupId: number): Promise<LookOverItem | null> {
    if (!this.carryIn(mockupId, ['offered'])) return null
    await this.prepare(mockupId)
    const draft = this.carryIn(mockupId, ['offered'])
    if (!draft?.carry) return null
    const carry = draft.carry
    const prepared = carry.prepared ?? (await this.version(await this.getProvider(), carry, draft))
    this.take(draft, carry, prepared, 'applied')
    return this.itemFor(mockupId)
  }

  /** Undo on a variant the edit reached: its own words come back, and the edit is on offer again. */
  async undoEdit(mockupId: number): Promise<LookOverItem | null> {
    const draft = this.carryIn(mockupId, ['applied', 'reworded'])
    const own = draft?.carry?.own
    if (!draft?.carry || !own) return null
    this.repo.drafts.updateDraft(mockupId, { ...own, carry: { ...draft.carry, state: 'offered', own: null } })
    return this.itemFor(mockupId)
  }

  /** × on an offer: set aside for this variant only. */
  async dismissEdit(mockupId: number): Promise<LookOverItem | null> {
    return this.moveCarry(mockupId, 'offered', 'dismissed')
  }

  /** ⌘Z after dismissing: the offer is back. */
  async restoreEdit(mockupId: number): Promise<LookOverItem | null> {
    return this.moveCarry(mockupId, 'dismissed', 'offered')
  }

  /** Resolves once no pile edit is being judged or prepared here. */
  async whenIdle(): Promise<void> {
    for (;;) {
      const work = this.work
      const preparing = [...this.preparing.values()]
      await Promise.all([work, ...preparing])
      if (work === this.work && this.preparing.size === 0) return
    }
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
    // An offer's version was made from the words the suggestion just replaced: make it again.
    const carry = draft.carry
    const stale =
      carry !== null &&
      (carry.state === 'offered' || carry.state === 'dismissed') &&
      ((patch.description !== undefined && patch.description !== draft.description) ||
        (patch.tagIds !== undefined && !sameIds(patch.tagIds, draft.tagIds)))
    this.repo.drafts.updateDraft(m.id, { ...patch, awaitingAi: false, ...(stale && { carry: { ...carry, prepared: null } }) })
    if (stale) this.queue(() => this.prepare(m.id))
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

  // ---- an edit to a pile top (design/specs/look-over.md, L7) ----

  /**
   * An edit to a pile top's description or tags, on each variant the person hasn't touched. A
   * model that judges pile edits (the 9B) checks each one in the background (`judgePile`); with
   * any other model, or none, each keeps its own words and offers the edit, and the version
   * accepting gives is prepared in the background. An edit that only takes words out reaches only
   * the variants whose words have them. A newer edit replaces an offer nobody answered, from where
   * that variant's words started. Returns the variants whose carry this changed.
   */
  private async carryEdit(top: Mockup, before: DraftWords, after: DraftWords): Promise<number[]> {
    const provider = await this.getProvider()
    const judges = !!provider?.pileEdits?.check
    const topDraft = this.repo.drafts.getDraft(top.id) ?? null
    const changed: number[] = []
    const reached: number[] = []
    for (const v of this.members(top.id)) {
      const draft = await this.draftFor(v, null, topDraft)
      if (draft.touched) continue
      const pending = draft.carry?.state === 'offered' || draft.carry?.state === 'checking' ? draft.carry : null
      const edit = { before: pending?.top.before ?? { description: before.description, tagIds: before.tagIds }, after: { description: after.description, tagIds: [...after.tagIds] } }
      if (!sameWords(edit.before, edit.after) && editReaches(this.wordsOf(edit), this.entryOf(draft))) {
        const carry: DraftCarry = { state: judges ? 'checking' : 'offered', top: edit, reason: null, prepared: null, own: null }
        this.repo.drafts.updateDraft(v.id, { carry })
        changed.push(v.id)
        reached.push(v.id)
      } else if (pending) {
        this.repo.drafts.updateDraft(v.id, { carry: null })
        changed.push(v.id)
      }
    }
    if (judges) {
      const run = ++this.lastRun
      this.runs.set(top.id, run)
      this.queue(() => this.judgePile(top.id, run, reached))
    } else {
      this.queue(() => this.prepareAll(reached))
    }
    return changed
  }

  /**
   * The model's check of one edit, variant by variant, one at a time, for at most `judgeMs`. On a
   * yes the edit is worked into the variant's own words; on a no, a failure or once time runs out,
   * the variant keeps its words and offers the edit (with the model's reason on a no). An answer
   * that comes back after its variant was offered, touched or given a newer edit is dropped.
   */
  private async judgePile(pileId: number, run: number, ids: number[]): Promise<void> {
    const current = () => this.runs.get(pileId) === run
    if (!current()) return
    const steps = (await this.getProvider())?.pileEdits
    const started = Date.now()
    const total = ids.length
    let completed = 0
    if (total > 0) this.onProgress({ pileId, completed, total, phase: 'running' })
    for (const id of ids) {
      const left = this.deps.judgeMs - (Date.now() - started)
      if (!current() || left <= 0 || !steps?.check) break
      const draft = this.checking(id)
      if (draft?.carry) {
        const verdict = await this.verdict(id, draft, draft.carry, steps, left)
        const now = current() ? this.checking(id) : undefined
        if (now?.carry) {
          if ('take' in verdict) this.take(now, now.carry, verdict.take, null)
          else this.repo.drafts.updateDraft(id, { carry: { ...now.carry, state: 'offered', reason: verdict.offer, prepared: verdict.prepared ?? null } })
          await this.pushItem(id)
        }
      }
      completed++
      if (completed < total) this.onProgress({ pileId, completed, total, phase: 'running' })
    }
    if (!current()) return
    // Out of time or failing: every variant not yet judged gets the offer, as with a model that judges nothing.
    for (const id of ids) {
      const draft = this.checking(id)
      if (!draft?.carry) continue
      this.repo.drafts.updateDraft(id, { carry: { ...draft.carry, state: 'offered' } })
      await this.pushItem(id)
    }
    if (total > 0) this.onProgress({ pileId, completed, total, phase: 'done' })
    this.runs.delete(pileId)
    await this.prepareAll(ids)
  }

  /** One variant's check: whether what the edit added is true of its cover, then on a yes its version. */
  private async verdict(id: number, draft: Draft, carry: DraftCarry, steps: PileEditSteps, left: number): Promise<Verdict> {
    const { added } = editDiff(this.wordsOf(carry.top))
    if (added.length > 0) {
      const cover = this.repo.mockups.getMockup(id)?.coverPath
      const said = cover && steps.check ? await withTimeout(steps.check(cover, this.wordsOf(carry.top), added), left).catch(() => null) : null
      if (!said) return { offer: null }
      if (said.answer === 'no') return { offer: said.reason || null }
    }
    const prepared = await this.version({ pileEdits: steps }, carry, draft)
    // A yes whose rewrite failed is offered, so the top's words never land on a variant unseen.
    return prepared.via === 'rewrite' ? { take: prepared } : { offer: null, prepared }
  }

  /** The edit in a variant's words: its version, and only the edit's tag changes. Marked applied when that is the top's own entry. */
  private take(draft: Draft, carry: DraftCarry, prepared: Prepared, state: Extract<CarryState, 'applied' | 'reworded'> | null): void {
    const own = { description: draft.description, tagIds: draft.tagIds }
    const tagIds = this.acceptedTagIds(draft.mockupId, own.tagIds, carry.top)
    const result = { description: prepared.description, tagIds }
    this.repo.drafts.updateDraft(draft.mockupId, {
      ...result,
      keptFields: keep(draft, ['description', 'tags']),
      carry: { ...carry, state: state ?? (sameWords(result, carry.top.after) ? 'applied' : 'reworded'), prepared, own }
    })
  }

  /** Prepare, one after another, the versions the offers on these variants give. */
  private async prepareAll(ids: number[]): Promise<void> {
    for (const id of ids) await this.prepare(id)
  }

  /**
   * Prepare the version accepting gives on an offered variant, unless it is ready. Waits for one
   * already under way, then looks again, in case a newer edit came meanwhile.
   */
  private async prepare(id: number): Promise<void> {
    for (let under = this.preparing.get(id); under; under = this.preparing.get(id)) await under
    const draft = this.carryIn(id, ['offered', 'dismissed'])
    if (!draft?.carry || draft.carry.prepared) return
    const carry = draft.carry
    const job = (async () => {
      const prepared = await this.version(await this.getProvider(), carry, draft)
      const now = this.carryIn(id, ['offered', 'dismissed'])
      if (!now?.carry || now.carry.prepared || now.description !== draft.description || !sameWords(now.carry.top.after, carry.top.after) || !sameWords(now.carry.top.before, carry.top.before)) return
      this.repo.drafts.updateDraft(id, { carry: { ...now.carry, prepared } })
      await this.pushItem(id)
    })().finally(() => this.preparing.delete(id))
    this.preparing.set(id, job)
    await job
  }

  /**
   * What accepting gives a variant's description: its own with the change worked in, or the top's
   * when the model has no rewrite, or it fails, is refused or takes longer than `rewriteMs`. An edit
   * that left the top's description alone leaves the variant's alone too. Never throws.
   */
  private async version(provider: Pick<InferenceProvider, 'pileEdits'> | null, carry: DraftCarry, draft: Draft): Promise<Prepared> {
    if (carry.top.before.description === carry.top.after.description) return { description: draft.description, via: 'rewrite' }
    const rewrite = provider?.pileEdits?.rewrite
    if (rewrite) {
      try {
        return { description: await withTimeout(rewrite(this.wordsOf(carry.top), this.entryOf(draft)), this.deps.rewriteMs), via: 'rewrite' }
      } catch {
        // Falls through to the copy.
      }
    }
    return { description: carry.top.after.description, via: 'copy' }
  }

  /** A variant still being checked whose check is no longer running (Look it over was closed before it finished): it gets the offer. */
  private unstuck(pileId: number, draft: Draft): Draft {
    if (draft.carry?.state !== 'checking' || this.runs.has(pileId)) return draft
    this.repo.drafts.updateDraft(draft.mockupId, { carry: { ...draft.carry, state: 'offered' } })
    this.queue(() => this.prepare(draft.mockupId))
    return this.repo.drafts.getDraft(draft.mockupId)!
  }

  /** The draft of a variant waiting in To stash whose carry is in one of these states. */
  private carryIn(id: number, states: CarryState[]): Draft | undefined {
    const m = this.repo.mockups.getMockup(id)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash') return undefined
    const draft = this.repo.drafts.getDraft(id)
    return draft?.carry && states.includes(draft.carry.state) ? draft : undefined
  }

  /** A variant still waiting for the model's check, and untouched. */
  private checking(id: number): Draft | undefined {
    const draft = this.carryIn(id, ['checking'])
    return draft && !draft.touched ? draft : undefined
  }

  private async moveCarry(id: number, from: CarryState, to: CarryState): Promise<LookOverItem | null> {
    const draft = this.carryIn(id, [from])
    if (!draft?.carry) return null
    this.repo.drafts.updateDraft(id, { carry: { ...draft.carry, state: to } })
    return this.itemFor(id)
  }

  /** An edit in words: descriptions and tag labels. */
  private wordsOf(top: DraftCarry['top']): PileEdit {
    return { before: this.entryOf(top.before), after: this.entryOf(top.after) }
  }

  /**
   * The tags accepting an edit gives a variant: only the edit's tag changes, and in each category
   * the edit added a tag to, the variant's own AI suggestions give way, since the edit counts as
   * approved (accepting Colour Terracotta drops a suggested Colour Beige). Tags the top keeps after
   * the edit stay, and so does every tag no suggestion gave the variant.
   */
  private acceptedTagIds(mockupId: number, own: number[], top: DraftCarry['top']): number[] {
    const changed = changedTagIds(own, top)
    const added = top.after.tagIds.filter((id) => !top.before.tagIds.includes(id))
    const set = new Set(this.repo.tags.getApprovalTagsByIds(added).map((t) => t.categoryId))
    const m = this.repo.mockups.getMockup(mockupId)
    const suggestion = set.size > 0 && m ? this.cachedSuggestion(m) : null
    if (!suggestion) return changed
    const suggested = new Set(
      suggestion.tags.flatMap(({ category, label }) => {
        const c = this.repo.tags.getCategoryByNormalisedLabel(category)
        const t = c && set.has(c.id) ? this.repo.tags.getTagByNormalisedLabel(c.id, label) : undefined
        return t ? [t.id] : []
      })
    )
    return changed.filter((id) => !suggested.has(id) || top.after.tagIds.includes(id))
  }

  private entryOf(words: DraftWords): PileEditEntry {
    return { description: words.description, tags: this.repo.tags.getApprovalTagsByIds(words.tagIds).map((t) => t.label) }
  }

  private queue(step: () => Promise<void>): void {
    this.work = this.work.then(step).catch((err: unknown) => console.warn('[look-over] a pile edit step failed', err))
  }

  private async itemFor(id: number): Promise<LookOverItem | null> {
    const m = this.repo.mockups.getMockup(id)
    const draft = this.repo.drafts.getDraft(id)
    if (!m || !draft) return null
    return this.toItem(m, draft, m.isGroup ? 'top' : m.groupId !== null ? 'variant' : 'single', m.isGroup ? m.id : m.groupId)
  }

  private async pushItem(id: number): Promise<void> {
    const m = this.repo.mockups.getMockup(id)
    if (!m || m.deletedAt !== null || m.stage !== 'to_stash') return
    const item = await this.itemFor(id)
    if (item) this.onItem(item)
  }

  /** A variant's carry as the renderer shows it: the version accepting gives, and only the edit's tag changes. */
  private carryOf(draft: Draft): LookOverCarry | null {
    const c = draft.carry
    if (!c) return null
    const took = c.state === 'applied' || c.state === 'reworded'
    const from = took && c.own ? c.own.tagIds : draft.tagIds
    const to = took ? draft.tagIds : this.acceptedTagIds(draft.mockupId, from, c.top)
    return {
      state: c.state,
      reason: c.reason,
      after: took ? { description: draft.description, via: c.prepared?.via ?? 'rewrite' } : c.prepared,
      tagsAdded: this.repo.tags.getApprovalTagsByIds(to.filter((id) => !from.includes(id))),
      tagsRemoved: this.repo.tags.getApprovalTagsByIds(from.filter((id) => !to.includes(id)))
    }
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
      carry: this.carryOf(draft),
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

/** A draft's kept fields with these added. */
const keep = (draft: Pick<Draft, 'keptFields'>, fields: DraftField[]): DraftField[] => [
  ...new Set([...draft.keptFields, ...fields])
]
