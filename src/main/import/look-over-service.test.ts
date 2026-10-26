import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { LookOverItem, LookOverProgress } from '@shared/approval'
import type { InferenceProvider, PileEdit, PileEditEntry, PileEditSteps } from '@shared/inference'
import type { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
import { ensureSearchIndex } from '../db/search-index'
import { sample, createTestDb } from '../db/repositories/__tests__/setup'
import { LookOverService, type LookOverDeps } from './look-over-service'

let sqlite: Database.Database
let repo: Repository
let progress: LookOverProgress[]
let probe: ReturnType<typeof vi.fn<LookOverDeps['probe']>>
let exists: ReturnType<typeof vi.fn<LookOverDeps['exists']>>

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  seedTaxonomy(test.db)
  ensureSearchIndex(test.db)
  progress = []
  probe = vi.fn(async () => ({ width: 1600, height: 1200 }))
  exists = vi.fn(async () => true)
})

let services: LookOverService[] = []

// Background pile-edit work finishes before the database closes.
afterEach(async () => {
  await Promise.all(services.map((s) => s.whenIdle()))
  services = []
  sqlite.close()
})

const service = (provider: InferenceProvider | null = null, extra: Partial<LookOverDeps> = {}) => {
  const svc = new LookOverService(repo, async () => provider, { probe, exists, ...extra }, (p) => progress.push(p))
  services.push(svc)
  return svc
}

type Check = { answer: 'yes' | 'no'; reason: string }

/** A model with pile-edit steps that answer as told: the check by the variant's cover path. */
function pileModel(steps: {
  check?: (coverPath: string, added: string[]) => Check | Promise<Check>
  rewrite?: (edit: PileEdit, entry: PileEditEntry) => string | Promise<string>
}) {
  const check = vi.fn(async (coverPath: string, _edit: PileEdit, added: string[]) => steps.check!(coverPath, added))
  const rewrite = vi.fn(async (edit: PileEdit, entry: PileEditEntry) => steps.rewrite!(edit, entry))
  const pileEdits: PileEditSteps = {}
  if (steps.check) pileEdits.check = check
  if (steps.rewrite) pileEdits.rewrite = rewrite
  const provider: InferenceProvider = {
    id: 'stub',
    name: 'Stub',
    analyze: async () => {
      throw new Error('not asked')
    },
    pileEdits
  }
  return Object.assign(provider, { check, rewrite })
}

/** A promise to settle by hand. */
function later<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

const itemOf = async (svc: LookOverService, id: number): Promise<LookOverItem> =>
  (await svc.open()).units.flatMap((u) => u.items).find((i) => i.mockupId === id)!

/** A tag by label, made in Environment when the seed has none. */
const tag = (label: string) =>
  repo.tags.getAllTags().find((t) => t.label === label) ??
  repo.tags.createTag({ categoryId: repo.tags.getCategoryByLabel('Environment')!.id, label })
const labels = (item: LookOverItem) => item.tags.map((t) => t.label)

/** An imported mockup waiting in To stash. */
const waiting = (name: string, extra = {}) => {
  const m = repo.mockups.createMockup({
    ...sample,
    title: name,
    libraryPath: `/lib/${name}.psd`,
    coverPath: `/lib/${name}.webp`,
    importContext: { batchId: 'b', folderTrail: [], originalFilename: `${name}.psd` },
    ...extra
  })
  repo.mockups.setStage([m.id], 'to_stash')
  return m
}

/** A pile in To stash: the first is the top. */
const pile = (...names: string[]) => {
  const rows = names.map((n) => waiting(n))
  repo.piles.createPile(rows.map((r) => r.id), rows[0]!.id)
  return rows
}

/** The background queue's suggestion for a mockup, as it saves it. */
const ready = (id: number, aiResult: { title: string; description: string; tags: { category: string; label: string }[] }) =>
  repo.mockups.updateMockup(id, { aiStatus: 'ready', aiResult })

const phone = () => repo.tags.getAllTags().find((t) => t.label === 'Phone')!

describe('open', () => {
  it('walks piles first, then mockups on their own, each pile top first', async () => {
    const single1 = waiting('single-1')
    const [top, side, back] = pile('phone_front', 'phone_side', 'phone_back')
    const single2 = waiting('single-2')

    const queue = await service().open()

    expect(queue.units.map((u) => [u.kind, u.unitId])).toEqual([
      ['pile', top!.id],
      ['single', single1.id],
      ['single', single2.id]
    ])
    expect(queue.units[0]!.items.map((i) => [i.mockupId, i.role, i.pileId])).toEqual([
      [top!.id, 'top', top!.id],
      [side!.id, 'variant', top!.id],
      [back!.id, 'variant', top!.id]
    ])
    expect(queue.units[1]!.items[0]).toMatchObject({ role: 'single', pileId: null })
    expect(queue.resume).toBeNull()
  })

  it('leaves out anything not waiting in To stash', async () => {
    waiting('ok')
    repo.mockups.createMockup({ ...sample, libraryPath: '/lib/fresh.psd' }) // still in To sort
    const trashed = waiting('trashed')
    repo.trash.moveToTrash(trashed.id)
    expect((await service().open()).units).toHaveLength(1)
  })

  it('uses the cached AI suggestion without asking the provider again', async () => {
    const m = waiting('a')
    repo.mockups.updateMockup(m.id, {
      aiStatus: 'ready',
      aiResult: { title: 'Clay phone', description: 'On a stand', tags: [{ category: 'Device', label: 'Phone' }] }
    })
    const analyze = vi.fn()

    const item = (await service({ id: 's', name: 's', analyze }).open()).units[0]!.items[0]!

    expect(analyze).not.toHaveBeenCalled()
    expect(item).toMatchObject({ title: 'Clay phone', description: 'On a stand', touched: false, checked: false })
    expect(item.tags.map((t) => t.label)).toEqual(['Phone'])
  })

  it("never asks the provider: a mockup without a suggestion starts from its file name and waits for the queue's", async () => {
    const m = waiting('my_phone-mockup')
    repo.mockups.updateMockup(m.id, { aiStatus: 'pending' })
    const analyze = vi.fn(async () => ({ title: 'Live title', description: 'd', tags: [] }))

    const item = (await service({ id: 's', name: 's', analyze }).open()).units[0]!.items[0]!

    expect(analyze).not.toHaveBeenCalled()
    expect(item).toMatchObject({ title: 'my phone mockup', description: '', waitingForAi: true })
  })

  it('keeps drafts between opens, so a title is not suggested twice', async () => {
    const m = waiting('a')
    ready(m.id, { title: 'Title 1', description: '', tags: [] })
    const svc = service()

    const first = (await svc.open()).units[0]!.items[0]!.title
    ready(m.id, { title: 'Title 2', description: '', tags: [] })
    const second = (await svc.open()).units[0]!.items[0]!.title

    expect([first, second]).toEqual(['Title 1', 'Title 1'])
  })

  it('starts each variant with its own cached description and tags, snapped like the top\'s, under the pile\'s base', async () => {
    const [top, side] = pile('phone_front', 'phone_side')
    ready(top!.id, { title: 'Clay phone', description: 'On a stand', tags: [{ category: 'Device', label: 'Phone' }] })
    ready(side!.id, { title: 'Clay phone, side', description: 'Edge on', tags: [{ category: 'Device', label: 'Laptop' }] })

    const items = (await service().open()).units[0]!.items

    expect(items[1]).toMatchObject({ mockupId: side!.id, title: 'Clay phone', description: 'Edge on', waitingForAi: false })
    expect(items.map((i) => i.variation)).toEqual([
      { words: 'front', source: 'marker' },
      { words: 'side', source: 'marker' }
    ])
    expect(items[1]!.tags.map((t) => t.label)).toEqual(['Laptop'])
  })

  it('fills a variant the AI hasn\'t finished from its name and the top, and says it is waiting', async () => {
    const [top, side] = pile('phone_front', 'phone_side')
    ready(top!.id, { title: 'Clay phone', description: 'On a stand', tags: [{ category: 'Device', label: 'Phone' }] })
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })

    const items = (await service().open()).units[0]!.items

    expect(items[0]!.waitingForAi).toBe(false)
    expect(items[1]).toMatchObject({ title: 'Clay phone', variation: { words: 'side', source: 'marker' }, description: 'On a stand', waitingForAi: true })
    expect(items[1]!.tags.map((t) => t.label)).toEqual(['Phone'])
  })

  it('never asks the provider for a top, a variant or a mockup on its own: the background queue reads them all', async () => {
    const [top, side, back] = pile('top', 'side', 'back')
    const alone = waiting('alone')
    for (const m of [top!, side!, back!, alone]) repo.mockups.updateMockup(m.id, { aiStatus: 'pending' })
    const analyze = vi.fn<InferenceProvider['analyze']>(async () => ({ title: 'Live', description: '', tags: [] }))

    const items = (await service({ id: 's', name: 's', analyze }).open()).units.flatMap((u) => u.items)

    expect(analyze).not.toHaveBeenCalled()
    expect(items.map((i) => i.waitingForAi)).toEqual([true, true, true, true])
  })

  it("says where each mockup's suggestion is, as the queue says it, so the rail is right from the first frame", async () => {
    const [top, side] = pile('top', 'side')
    ready(top!.id, { title: 'Top', description: '', tags: [] })
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const run = { phase: 'queued' as const, writingSince: null, slowAfterMs: 20_000 }
    const svc = service(null, { aiStatusOf: (id) => (id === side!.id ? { mockupId: id, status: 'pending', run } : null) })

    const items = (await svc.open()).units[0]!.items

    expect(items.map((i) => i.ai)).toEqual([{ status: 'ready' }, { status: 'pending', run }])
  })

  it('says whether the active model checks an edit to a pile top against each variant (L7.1)', async () => {
    waiting('a')
    expect((await service(pileModel({ check: () => ({ answer: 'yes', reason: '' }), rewrite: () => '' })).open()).checksEdits).toBe(true)
    expect((await service(pileModel({ rewrite: () => '' })).open()).checksEdits).toBe(false)
    expect((await service(null).open()).checksEdits).toBe(false)
  })

  it('lists the mockups it shows that the AI was never asked about, for the queue', async () => {
    const [top, side] = pile('top', 'side')
    const alone = waiting('alone')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    repo.mockups.updateMockup(alone.id, { aiStatus: 'failed' })
    expect(service().unasked()).toEqual([top!.id])
  })

  it('reports the cover with its size, whether it is missing, and the sidecar it came from', async () => {
    const m = waiting('a', { coverSource: 'sidecar', coverPath: '/lib/a-sidecar.webp' })
    exists.mockResolvedValueOnce(false)
    probe.mockRejectedValueOnce(new Error('gone'))

    const item = (await service().open()).units[0]!.items[0]!

    expect(item.mockupId).toBe(m.id)
    expect(item.cover).toEqual({
      path: '/lib/a-sidecar.webp',
      source: 'sidecar',
      missing: true,
      width: null,
      height: null
    })
  })

  it('gives the size of a cover that is there', async () => {
    waiting('a')
    const item = (await service().open()).units[0]!.items[0]!
    expect(item.cover).toMatchObject({ missing: false, width: 1600, height: 1200 })
  })

  it('has no paths other than the cover path, and none in any title', async () => {
    waiting('a')
    const json = JSON.stringify(await service().open())
    expect(json).not.toContain('/Users')
  })
})

describe('saveDraft', () => {
  it('keeps the edit as a draft and leaves the mockup itself alone', async () => {
    const m = waiting('a')
    await service().open()

    await service().saveDraft({ mockupId: m.id, title: 'Edited', description: 'New', tagIds: [phone().id] })

    const item = (await service().open()).units[0]!.items[0]!
    expect(item).toMatchObject({ title: 'Edited', description: 'New', checked: true })
    expect(item.tags.map((t) => t.label)).toEqual(['Phone'])
    expect(repo.mockups.getMockup(m.id)).toMatchObject({ title: 'a', stage: 'to_stash' })
    expect(repo.mockups.getTagsForMockup(m.id)).toEqual([])
  })

  it('can save without marking it looked at', async () => {
    const m = waiting('a')
    await service().saveDraft({ mockupId: m.id, title: 'T', description: '', tagIds: [], checked: false })
    expect((await service().open()).units[0]!.items[0]!.checked).toBe(false)
  })

  it('marks a variant touched when the user changes its words, but not when nothing changed', async () => {
    const [, side] = pile('top', 'side')
    const svc = service()
    const before = (await svc.open()).units[0]!.items[1]!

    await svc.saveDraft({ mockupId: side!.id, title: before.title, description: before.description, tagIds: before.tags.map((t) => t.tagId) })
    expect((await svc.open()).units[0]!.items[1]!.touched).toBe(false)

    // The base is the pile's and the variation the mockup's own name: neither is the variant's words.
    await svc.saveDraft({ mockupId: side!.id, title: 'Retitled', variation: 'edge on', description: before.description, tagIds: before.tags.map((t) => t.tagId) })
    expect((await svc.open()).units[0]!.items[1]!).toMatchObject({ touched: false, title: 'Retitled', variation: { words: 'edge on', source: 'typed' } })

    await svc.saveDraft({ mockupId: side!.id, title: 'Retitled', description: 'Mine now', tagIds: [] })
    expect((await svc.open()).units[0]!.items[1]!.touched).toBe(true)
  })

  it('carries only the base, exactly, when only the top\'s title changed', async () => {
    const [top, a] = pile('top', 'a')
    const svc = service()
    const first = (await svc.open()).units[0]!.items[0]!

    const res = await svc.saveDraft({
      mockupId: top!.id,
      title: 'Only the title',
      description: first.description,
      tagIds: first.tags.map((t) => t.tagId)
    })

    expect(res.propagatedIds).toEqual([a!.id])
    expect(await itemOf(svc, a!.id)).toMatchObject({ title: 'Only the title', variation: { words: 'A', source: 'marker' }, carry: null })
    expect(progress).toEqual([])
  })

  it('renames the pile from a variant\'s base too, and never carries a variation', async () => {
    const [top, side] = pile('top', 'side')
    const svc = service()
    await svc.open()

    const res = await svc.saveDraft({ mockupId: side!.id, title: 'Clay phone', variation: 'edge on', description: '', tagIds: [] })

    expect(res.propagatedIds).toEqual([top!.id])
    expect(await itemOf(svc, top!.id)).toMatchObject({ title: 'Clay phone', variation: { words: 'top', source: 'marker' } })
  })

  it('does not carry anything from a variant or a mockup on its own', async () => {
    const [, side] = pile('top', 'side')
    const alone = waiting('alone')
    const svc = service()
    await svc.open()
    expect((await svc.saveDraft({ mockupId: side!.id, title: 'top', description: 'x', tagIds: [] })).propagatedIds).toEqual([])
    expect((await svc.saveDraft({ mockupId: alone.id, title: 'a', description: 'x', tagIds: [] })).propagatedIds).toEqual([])
  })

  it('refuses a mockup that is not waiting in To stash', async () => {
    const m = repo.mockups.createMockup({ ...sample, libraryPath: '/lib/fresh.psd' })
    await expect(service().saveDraft({ mockupId: m.id, title: 'T', description: '', tagIds: [] })).rejects.toThrow()
    await expect(service().saveDraft({ mockupId: 9999, title: 'T', description: '', tagIds: [] })).rejects.toThrow()
  })
})

describe('skip for now', () => {
  it('sends a mockup on its own to the end, in the order skipped', async () => {
    const [a, b, c] = [waiting('a'), waiting('b'), waiting('c')]
    const svc = service()
    await svc.open()

    expect(await svc.skip(a.id)).toEqual({ skipped: true })
    expect((await svc.open()).units.map((u) => u.unitId)).toEqual([b.id, c.id, a.id])

    await new Promise((r) => setTimeout(r, 5))
    await svc.skip(b.id)
    expect((await svc.open()).units.map((u) => u.unitId)).toEqual([c.id, a.id, b.id])
  })

  it('never skips past the piles', async () => {
    const [top] = pile('top', 'side')
    const alone = waiting('alone')
    const svc = service()
    await svc.open()
    await svc.skip(alone.id)
    expect((await svc.open()).units.map((u) => u.unitId)).toEqual([top!.id, alone.id])
  })

  it('does not skip a pile or a pile member', async () => {
    const [top, side] = pile('top', 'side')
    const svc = service()
    await svc.open()
    expect(await svc.skip(top!.id)).toEqual({ skipped: false })
    expect(await svc.skip(side!.id)).toEqual({ skipped: false })
    expect(await svc.skip(9999)).toEqual({ skipped: false })
  })
})

describe('resume pointer', () => {
  it('remembers where Finish later left off and gives it back on open', async () => {
    const [top, side] = pile('top', 'side')
    const svc = service()
    await svc.open()

    expect(await svc.setResume(top!.id, side!.id)).toEqual({ saved: true })
    expect((await svc.open()).resume).toEqual({ unitId: top!.id, mockupId: side!.id })
  })

  it('ignores a pointer to something that is not in that unit', async () => {
    const [top] = pile('top', 'side')
    const other = waiting('other')
    expect(await service().setResume(top!.id, other.id)).toEqual({ saved: false })
    expect((await service().open()).resume).toBeNull()
  })

  it('drops a pointer whose pile has been stashed or tossed', async () => {
    const [top, side] = pile('top', 'side')
    await service().setResume(top!.id, side!.id)
    repo.mockups.setStage([top!.id, side!.id], 'stashed')
    expect((await service().open()).resume).toBeNull()
  })
})

describe('a suggestion that lands after the draft was made', () => {
  const landed = { title: 'Blue scroll Macbook', description: 'A long page', tags: [{ category: 'Device', label: 'Laptop' }] }

  it('replaces a waiting variant\'s fallback words and stops waiting, once, keeping the pile\'s base', async () => {
    const [, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const svc = service()
    await svc.open()

    expect(await svc.settle(side!.id)).toBeNull()
    ready(side!.id, landed)
    const item = await svc.settle(side!.id)

    expect(item).toMatchObject({ mockupId: side!.id, role: 'variant', title: 'top', description: 'A long page', waitingForAi: false })
    expect(item!.tags.map((t) => t.label)).toEqual(['Laptop'])
    expect(await svc.settle(side!.id)).toBeNull()
    expect((await svc.open()).units[0]!.items[1]).toMatchObject({ title: 'top', waitingForAi: false })
  })

  it('keeps every field the user edited', async () => {
    const [, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const svc = service()
    const before = (await svc.open()).units[0]!.items[1]!
    await svc.saveDraft({ mockupId: side!.id, title: 'My side', description: before.description, tagIds: [] })

    ready(side!.id, landed)
    const item = await svc.settle(side!.id)

    expect(item).toMatchObject({ title: 'My side', description: 'A long page', waitingForAi: false })
    expect(item!.tags.map((t) => t.label)).toEqual(['Laptop'])
  })

  it('keeps the description and tags an accepted edit set, and the pile\'s base', async () => {
    const [top, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const svc = service(pileModel({ rewrite: () => 'Shared words, on the side' }))
    await svc.open()
    await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'Shared words', tagIds: [phone().id] })
    await svc.acceptEdit(side!.id)

    ready(side!.id, landed)
    const item = await svc.settle(side!.id)

    expect(item).toMatchObject({ title: 'top', description: 'Shared words, on the side', waitingForAi: false })
    expect(item!.tags.map((t) => t.label)).toEqual(['Phone'])
  })

  it("prepares an offered variant's version again once its own suggestion lands", async () => {
    const [top, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const model = pileModel({ rewrite: (_e, entry) => `${entry.description}, edited` })
    const svc = service(model)
    await svc.open()
    await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'Shared words', tagIds: [] })
    await svc.whenIdle()

    ready(side!.id, landed)
    await svc.settle(side!.id)
    await svc.whenIdle()

    expect((await itemOf(svc, side!.id)).carry).toMatchObject({ state: 'offered', after: { description: 'A long page, edited', via: 'rewrite' } })
  })

  it('fills in a top or a mockup on its own once the queue writes its suggestion', async () => {
    const alone = waiting('my_mockup')
    repo.mockups.updateMockup(alone.id, { aiStatus: 'pending' })
    const svc = service()
    expect((await svc.open()).units[0]!.items[0]).toMatchObject({ title: 'my mockup', waitingForAi: true })

    ready(alone.id, landed)
    expect(await svc.settle(alone.id)).toMatchObject({ role: 'single', pileId: null, title: 'Blue scroll Macbook' })
  })

  it('stops waiting with the fallback kept when the AI fails or is turned off', async () => {
    const [, side, back] = pile('top', 'side', 'back')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    repo.mockups.updateMockup(back!.id, { aiStatus: 'sniffing' })
    const svc = service()
    await svc.open()

    repo.mockups.updateMockup(side!.id, { aiStatus: 'failed' })
    repo.mockups.updateMockup(back!.id, { aiStatus: 'off' })

    expect(await svc.settle(side!.id)).toMatchObject({ title: 'top', variation: { words: 'side' }, waitingForAi: false })
    expect(await svc.settle(back!.id)).toMatchObject({ title: 'top', variation: { words: 'back' }, waitingForAi: false })
  })

  it('catches up on open when the suggestion landed while Look it over was shut', async () => {
    const [, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    await service().open()

    ready(side!.id, landed)

    expect((await service().open()).units[0]!.items[1]).toMatchObject({ title: 'top', description: 'A long page', waitingForAi: false })
  })

  it('names the pile from the top\'s suggestion: every mockup takes the base, each told on look-over:draft', async () => {
    const [top, side] = pile('top', 'side')
    repo.mockups.updateMockup(top!.id, { aiStatus: 'pending' })
    const svc = service()
    const pushed: LookOverItem[] = []
    svc.onItem = (item) => pushed.push(item)
    await svc.open()

    ready(top!.id, landed)
    expect(await svc.settle(top!.id)).toMatchObject({ title: 'Blue scroll Macbook', variation: { words: 'top' } })

    expect(pushed.map((i) => [i.mockupId, i.title])).toEqual([[side!.id, 'Blue scroll Macbook']])
  })

  it('keeps a base the person typed from the top\'s late suggestion', async () => {
    const [top, side] = pile('top', 'side')
    repo.mockups.updateMockup(top!.id, { aiStatus: 'pending' })
    const svc = service()
    await svc.open()
    await svc.saveDraft({ mockupId: side!.id, title: 'My pile', description: '', tagIds: [] })

    ready(top!.id, landed)
    await svc.settle(top!.id)

    expect((await svc.open()).units[0]!.items.map((i) => i.title)).toEqual(['My pile', 'My pile'])
  })

  it('has nothing to say for a mockup with no draft or not in To stash', async () => {
    const [, side] = pile('top', 'side')
    ready(side!.id, landed)
    expect(await service().settle(side!.id)).toBeNull()
    expect(await service().settle(9999)).toBeNull()
  })
})

describe('Fill it myself and Write suggestions (L6.E1, L6.E3)', () => {
  const landed = { title: 'Blue scroll Macbook', description: 'On a bench', tags: [] }

  it('stops waiting for the AI and keeps every field as it is, so a late suggestion never lands', async () => {
    const [, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const svc = service()
    const before = await itemOf(svc, side!.id)

    const item = await svc.fillMyself(side!.id)
    repo.mockups.updateMockup(side!.id, { aiStatus: 'opted_out' })

    expect(item).toMatchObject({ title: before.title, description: before.description, waitingForAi: false })
    ready(side!.id, landed)
    expect(await svc.settle(side!.id)).toBeNull()
    expect((await itemOf(svc, side!.id)).title).toBe('top')
  })

  it('makes the draft of one not opened yet, from its file name', async () => {
    const alone = waiting('my_mockup')
    repo.mockups.updateMockup(alone.id, { aiStatus: 'pending' })
    expect(await service().fillMyself(alone.id)).toMatchObject({ title: 'my mockup', waitingForAi: false })
  })

  it('waits for the AI again on Write suggestions, and the answer fills only the fields the person left alone', async () => {
    const alone = waiting('my_mockup')
    repo.mockups.updateMockup(alone.id, { aiStatus: 'opted_out' })
    const svc = service()
    await svc.fillMyself(alone.id)
    await svc.saveDraft({ mockupId: alone.id, title: 'My own title', description: '', tagIds: [] })

    expect(await svc.waitForAi(alone.id)).toMatchObject({ title: 'My own title', waitingForAi: true })
    ready(alone.id, landed)
    expect(await svc.settle(alone.id)).toMatchObject({ title: 'My own title', description: 'On a bench', waitingForAi: false })
  })

  it('has nothing to do for a mockup not waiting in To stash', async () => {
    const m = waiting('a')
    repo.mockups.setStage([m.id], 'stashed')
    const svc = service()
    expect(await svc.fillMyself(m.id)).toBeNull()
    expect(await svc.waitForAi(m.id)).toBeNull()
  })
})

describe('walkFrom', () => {
  it('walks a pile from any of its mockups: it, the ones after it, then the ones before; a mockup on its own is itself', () => {
    const [top, a, b] = pile('top', 'a', 'b')
    const alone = waiting('alone')
    const svc = service()
    expect(svc.walkFrom(top!.id)).toEqual([top!.id, a!.id, b!.id])
    expect(svc.walkFrom(a!.id)).toEqual([a!.id, b!.id, top!.id])
    expect(svc.walkFrom(alone.id)).toEqual([alone.id])
    expect(svc.walkFrom(9999)).toEqual([])
  })
})

describe('an edit to a pile top', () => {
  /** A pile whose top and variants hold these words, saved as drafts the way Look it over makes them. */
  async function editedPile(svc: LookOverService, variants: { description: string; tags: string[] }[]) {
    const rows = pile('top', ...variants.map((_, i) => `v${i + 1}`))
    await svc.open()
    repo.drafts.updateDraft(rows[0]!.id, { title: 'top', description: 'A laptop on white books.', tagIds: [tag('Laptop').id, tag('books').id] })
    variants.forEach((v, i) => repo.drafts.updateDraft(rows[i + 1]!.id, { title: `v${i + 1}`, description: v.description, tagIds: v.tags.map((l) => tag(l).id) }))
    const save = () =>
      svc.saveDraft({ mockupId: rows[0]!.id, title: 'top', description: 'A laptop on a white slatted bench.', tagIds: [tag('Laptop').id, tag('bench').id] })
    return { rows, save }
  }

  it("leaves each untouched variant its own words and offers the edit, when the model judges nothing", async () => {
    const model = pileModel({ rewrite: (_e, entry) => `${entry.description} Now on a bench.` })
    const svc = service(model)
    const pushed: LookOverItem[] = []
    svc.onItem = (i) => pushed.push(i)
    const { rows, save } = await editedPile(svc, [
      { description: 'A laptop on a mesh floor.', tags: ['Laptop', 'floor'] },
      { description: 'Mine.', tags: [] }
    ])
    await svc.saveDraft({ mockupId: rows[2]!.id, title: 'v2', description: 'Mine, edited.', tagIds: [] })

    expect((await save()).propagatedIds).toEqual([rows[1]!.id])
    const offered = await itemOf(svc, rows[1]!.id)
    expect(offered).toMatchObject({ description: 'A laptop on a mesh floor.', carry: { state: 'offered', reason: null } })
    expect(labels(offered)).toEqual(['Laptop', 'floor'])
    // The one the person edited is left alone.
    expect((await itemOf(svc, rows[2]!.id)).carry).toBeNull()

    await svc.whenIdle()
    const ready = await itemOf(svc, rows[1]!.id)
    expect(ready.carry).toMatchObject({
      state: 'offered',
      after: { description: 'A laptop on a mesh floor. Now on a bench.', via: 'rewrite' },
      tagsRemoved: []
    })
    expect(ready.carry!.tagsAdded.map((t) => t.label)).toEqual(['bench'])
    expect(ready.description).toBe('A laptop on a mesh floor.')
    expect(pushed.at(-1)).toMatchObject({ mockupId: rows[1]!.id, carry: { after: { via: 'rewrite' } } })
    expect(model.rewrite).toHaveBeenCalledWith(
      { before: { description: 'A laptop on white books.', tags: ['Laptop', 'books'] }, after: { description: 'A laptop on a white slatted bench.', tags: ['Laptop', 'bench'] } },
      { description: 'A laptop on a mesh floor.', tags: ['Laptop', 'floor'] }
    )
    expect(progress).toEqual([])
  })

  it.each([
    ['fails or is refused', (): InferenceProvider | null => pileModel({ rewrite: () => Promise.reject(new Error('refused')) }), {}],
    ['takes too long', (): InferenceProvider | null => pileModel({ rewrite: () => new Promise<string>(() => {}) }), { rewriteMs: 10 }],
    ['has no model to ask', (): InferenceProvider | null => null, {}]
  ] as const)("prepares the top's description as a copy, marked so, when the rewrite %s", async (_why, provider, extra) => {
    const svc = service(provider(), extra)
    const { rows, save } = await editedPile(svc, [{ description: 'A laptop on a mesh floor.', tags: [] }])
    await save()
    await svc.whenIdle()
    expect((await itemOf(svc, rows[1]!.id)).carry!.after).toEqual({ description: 'A laptop on a white slatted bench.', via: 'copy' })
  })

  it("takes only the edit's tag changes: the added ones added, the removed ones taken out, the rest kept", async () => {
    const svc = service(pileModel({ rewrite: (_e, entry) => entry.description }))
    const { rows, save } = await editedPile(svc, [
      { description: 'On books, by a plant.', tags: ['Laptop', 'books', 'plant'] },
      { description: 'On a bench already.', tags: ['bench'] }
    ])
    await save()
    const first = (await itemOf(svc, rows[1]!.id)).carry!
    expect(first.tagsAdded.map((t) => t.label)).toEqual(['bench'])
    expect(first.tagsRemoved.map((t) => t.label)).toEqual(['books'])
    const second = (await itemOf(svc, rows[2]!.id)).carry!
    expect(second.tagsAdded).toEqual([])
    expect(second.tagsRemoved).toEqual([])
  })

  it('does nothing when only the title changed, or for a variant or a mockup on its own', async () => {
    const [top, side] = pile('top', 'side')
    const alone = waiting('alone')
    const svc = service(pileModel({ rewrite: () => 'x' }))
    const first = (await svc.open()).units[0]!.items[0]!
    // A new title is the pile's base, which carries exactly: nothing is judged or offered.
    expect((await svc.saveDraft({ mockupId: top!.id, title: 'Only the title', description: first.description, tagIds: first.tags.map((t) => t.tagId) })).propagatedIds).toEqual([side!.id])
    expect((await svc.saveDraft({ mockupId: side!.id, title: 'Only the title', description: 'x', tagIds: [] })).propagatedIds).toEqual([])
    expect((await svc.saveDraft({ mockupId: alone.id, title: 'a', description: 'x', tagIds: [] })).propagatedIds).toEqual([])
    expect((await itemOf(svc, side!.id)).carry).toBeNull()
  })

  it('offers an edit that only takes words out to the variants whose words have them, and to no other', async () => {
    const svc = service(pileModel({ rewrite: () => 'A laptop.' }))
    const [top, a, b] = pile('top', 'a', 'b')
    await svc.open()
    repo.drafts.updateDraft(top!.id, { title: 'top', description: 'A laptop on a desk.', tagIds: [tag('desk').id] })
    repo.drafts.updateDraft(a!.id, { title: 'a', description: 'A laptop on a desk.', tagIds: [] })
    repo.drafts.updateDraft(b!.id, { title: 'b', description: 'A laptop on a shelf.', tagIds: [] })
    expect((await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'A laptop.', tagIds: [] })).propagatedIds).toEqual([a!.id])
    expect((await itemOf(svc, b!.id)).carry).toBeNull()
  })

  it("keeps where the variant's words started when a newer edit replaces an offer nobody answered, and drops the offer when the top goes back", async () => {
    const model = pileModel({ rewrite: (_e, entry) => entry.description })
    const svc = service(model)
    const { rows, save } = await editedPile(svc, [{ description: 'A laptop on a mesh floor.', tags: [] }])
    await save()
    await svc.saveDraft({ mockupId: rows[0]!.id, title: 'top', description: 'A laptop on a long white slatted bench.', tagIds: [tag('Laptop').id, tag('bench').id] })
    await svc.whenIdle()
    expect(model.rewrite.mock.calls.at(-1)![0].before.description).toBe('A laptop on white books.')

    await svc.saveDraft({ mockupId: rows[0]!.id, title: 'top', description: 'A laptop on white books.', tagIds: [tag('Laptop').id, tag('books').id] })
    expect((await itemOf(svc, rows[1]!.id)).carry).toBeNull()
  })

  it('takes a variant out of the edit once the person edits it', async () => {
    const svc = service(pileModel({ rewrite: () => 'x' }))
    const { rows, save } = await editedPile(svc, [{ description: 'A laptop on a mesh floor.', tags: [] }])
    await save()
    await svc.saveDraft({ mockupId: rows[1]!.id, title: 'v1', description: 'My own words.', tagIds: [] })
    expect(await itemOf(svc, rows[1]!.id)).toMatchObject({ touched: true, carry: null })
  })

  describe('with a model that judges pile edits', () => {
    it("checks each untouched variant in the background, works the edit into those it fits, offers it with the model's reason on the rest, and says how far it got", async () => {
      const model = pileModel({
        check: (cover) => (cover.includes('v1') ? { answer: 'yes', reason: '' } : { answer: 'no', reason: 'this one is on a mesh floor' }),
        rewrite: (_e, entry) => entry.description.replace('white books', 'a white slatted bench')
      })
      const svc = service(model)
      const pushed: LookOverItem[] = []
      svc.onItem = (i) => pushed.push(i)
      const { rows, save } = await editedPile(svc, [
        { description: 'A silver laptop on white books by a window.', tags: ['Laptop', 'books'] },
        { description: 'A laptop on a mesh floor.', tags: ['Laptop', 'floor'] }
      ])

      expect((await save()).propagatedIds).toEqual([rows[1]!.id, rows[2]!.id])
      expect((await itemOf(svc, rows[1]!.id)).carry).toMatchObject({ state: 'checking' })

      await svc.whenIdle()
      const took = await itemOf(svc, rows[1]!.id)
      expect(took).toMatchObject({ description: 'A silver laptop on a white slatted bench by a window.', carry: { state: 'reworded', after: { via: 'rewrite' } } })
      expect(labels(took)).toEqual(['Laptop', 'bench'])
      const left = await itemOf(svc, rows[2]!.id)
      expect(left).toMatchObject({ description: 'A laptop on a mesh floor.', carry: { state: 'offered', reason: 'this one is on a mesh floor' } })
      expect(left.carry!.after).toEqual({ description: 'A laptop on a mesh floor.', via: 'rewrite' })
      expect(model.check).toHaveBeenCalledWith('/lib/v1.webp', expect.anything(), ['slatted', 'bench'])

      expect(progress[0]).toEqual({ pileId: rows[0]!.id, completed: 0, total: 2, phase: 'running' })
      expect(progress.at(-1)).toEqual({ pileId: rows[0]!.id, completed: 2, total: 2, phase: 'done' })
      expect(pushed.map((i) => [i.mockupId, i.carry?.state])).toContainEqual([rows[1]!.id, 'reworded'])
      // A late suggestion doesn't undo what the edit set.
      expect(repo.drafts.getDraft(rows[1]!.id)!.keptFields).toEqual(expect.arrayContaining(['description', 'tags']))
    })

    it("marks a variant applied when it ends with the top's own words", async () => {
      const svc = service(pileModel({ check: () => ({ answer: 'yes', reason: '' }), rewrite: () => 'A laptop on a white slatted bench.' }))
      const { rows, save } = await editedPile(svc, [{ description: 'A laptop on white books.', tags: ['Laptop', 'books'] }])
      await save()
      await svc.whenIdle()
      expect((await itemOf(svc, rows[1]!.id)).carry).toMatchObject({ state: 'applied' })
    })

    it('offers the edit, with no reason, where the check fails or the rewrite after a yes does', async () => {
      const svc = service(pileModel({
        check: (cover) => (cover.includes('v1') ? Promise.reject(new Error('busy')) : { answer: 'yes', reason: '' }),
        rewrite: () => Promise.reject(new Error('refused'))
      }))
      const { rows, save } = await editedPile(svc, [
        { description: 'One.', tags: [] },
        { description: 'Two.', tags: [] }
      ])
      await save()
      await svc.whenIdle()
      expect((await itemOf(svc, rows[1]!.id)).carry).toMatchObject({ state: 'offered', reason: null })
      expect((await itemOf(svc, rows[2]!.id)).carry).toMatchObject({ state: 'offered', reason: null, after: { via: 'copy' } })
      expect((await itemOf(svc, rows[2]!.id)).description).toBe('Two.')
    })

    it("offers every variant it hasn't judged once the pile's time runs out, and drops a late answer", async () => {
      const slow = later<Check>()
      const svc = service(
        pileModel({ check: (cover) => (cover.includes('v1') ? { answer: 'yes', reason: '' } : slow.promise), rewrite: (_e, entry) => `${entry.description} On a bench.` }),
        { judgeMs: 30 }
      )
      const { rows, save } = await editedPile(svc, [
        { description: 'One.', tags: [] },
        { description: 'Two.', tags: [] },
        { description: 'Three.', tags: [] }
      ])
      await save()
      await svc.whenIdle()
      expect((await itemOf(svc, rows[1]!.id)).carry).toMatchObject({ state: 'reworded' })
      for (const r of [rows[2]!, rows[3]!]) expect((await itemOf(svc, r.id)).carry).toMatchObject({ state: 'offered', reason: null })

      slow.resolve({ answer: 'yes', reason: '' })
      await svc.whenIdle()
      expect(await itemOf(svc, rows[2]!.id)).toMatchObject({ description: 'Two.', carry: { state: 'offered' } })
      expect(progress.at(-1)).toMatchObject({ phase: 'done' })
    })

    it("starts the pile's time once the model is loaded, so a cold start doesn't use it up", async () => {
      let loaded = false
      const coldStart = async () => {
        await new Promise((resolve) => setTimeout(resolve, 80))
        loaded = true
      }
      const model = pileModel({
        // A request to a model that isn't loaded waits for it to load first.
        check: async (): Promise<Check> => {
          if (!loaded) await coldStart()
          return { answer: 'yes', reason: '' }
        },
        rewrite: (_e, entry) => `${entry.description} On a bench.`
      })
      Object.assign(model, { load: coldStart })
      const svc = service(model, { judgeMs: 40 })
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }])
      await save()
      await svc.whenIdle()
      expect((await itemOf(svc, rows[1]!.id)).carry).toMatchObject({ state: 'reworded' })
    })

    it('takes words out where they are, with no check, for an edit that only takes words out', async () => {
      const model = pileModel({ check: () => ({ answer: 'no', reason: 'x' }), rewrite: () => 'A laptop.' })
      const svc = service(model)
      const [top, a, b] = pile('top', 'a', 'b')
      await svc.open()
      repo.drafts.updateDraft(top!.id, { title: 'top', description: 'A laptop on a desk.', tagIds: [tag('desk').id] })
      repo.drafts.updateDraft(a!.id, { title: 'a', description: 'A laptop on a desk.', tagIds: [tag('desk').id] })
      repo.drafts.updateDraft(b!.id, { title: 'b', description: 'A laptop on a shelf.', tagIds: [] })
      await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'A laptop.', tagIds: [] })
      await svc.whenIdle()
      expect(model.check).not.toHaveBeenCalled()
      const took = await itemOf(svc, a!.id)
      // Its words end as the top's, so it reads as applied.
      expect(took).toMatchObject({ description: 'A laptop.', carry: { state: 'applied' } })
      expect(took.tags).toEqual([])
      expect((await itemOf(svc, b!.id)).carry).toBeNull()
    })

    it('offers a variant still being checked when Look it over was closed before the check finished', async () => {
      const hung = later<Check>()
      const svc = service(pileModel({ check: () => hung.promise, rewrite: () => 'x' }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }])
      await save()
      // The app restarted: a new service, with no check running.
      expect((await itemOf(service(pileModel({ rewrite: () => 'x' })), rows[1]!.id)).carry).toMatchObject({ state: 'offered', reason: null })
      hung.reject(new Error('the old app is gone'))
    })
  })

  describe('why an edit is on offer (L7.E3 to L7.E5, L7.7, L7.9)', () => {
    const whyOf = async (svc: LookOverService, id: number) => (await itemOf(svc, id)).carry?.why

    it("is `unjudged` with a model that doesn't check edits", async () => {
      const svc = service(pileModel({ rewrite: (_e, entry) => entry.description }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }])
      await save()
      await svc.whenIdle()
      expect(await whyOf(svc, rows[1]!.id)).toBe('unjudged')
    })

    it('is `refused` when the model says no, and null while it checks and once the edit is in', async () => {
      const hold = later<Check>()
      const svc = service(pileModel({ check: (cover) => (cover.includes('v1') ? hold.promise : { answer: 'yes', reason: '' }), rewrite: (_e, entry) => `${entry.description} On a bench.` }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }, { description: 'Two.', tags: [] }])
      await save()
      expect(await whyOf(svc, rows[1]!.id)).toBeNull()
      hold.resolve({ answer: 'no', reason: 'this one is on a mesh floor' })
      await svc.whenIdle()
      expect((await itemOf(svc, rows[1]!.id)).carry).toMatchObject({ why: 'refused', reason: 'this one is on a mesh floor' })
      expect((await itemOf(svc, rows[2]!.id)).carry).toMatchObject({ state: 'reworded', why: null })
    })

    it('is `failed` when the check fails, or the rewrite after its yes does', async () => {
      const svc = service(pileModel({
        check: (cover) => (cover.includes('v1') ? Promise.reject(new Error('busy')) : { answer: 'yes', reason: '' }),
        rewrite: () => Promise.reject(new Error('refused'))
      }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }, { description: 'Two.', tags: [] }])
      await save()
      await svc.whenIdle()
      expect([await whyOf(svc, rows[1]!.id), await whyOf(svc, rows[2]!.id)]).toEqual(['failed', 'failed'])
    })

    it("is `slow` when the check runs out of time, for the one it was on and the ones it didn't reach", async () => {
      const slow = later<Check>()
      const svc = service(pileModel({ check: () => slow.promise, rewrite: (_e, entry) => entry.description }), { judgeMs: 30 })
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }, { description: 'Two.', tags: [] }])
      await save()
      await svc.whenIdle()
      expect([await whyOf(svc, rows[1]!.id), await whyOf(svc, rows[2]!.id)]).toEqual(['slow', 'slow'])
      slow.resolve({ answer: 'yes', reason: '' })
    })

    it('is `slow` when Look it over closed before the check reached it', async () => {
      const hung = later<Check>()
      const svc = service(pileModel({ check: () => hung.promise, rewrite: () => 'x' }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }])
      await save()
      expect(await whyOf(service(pileModel({ rewrite: () => 'x' })), rows[1]!.id)).toBe('slow')
      hung.reject(new Error('the old app is gone'))
    })

    it('is `undone` once the person undoes an edit that reached it', async () => {
      const svc = service(pileModel({ check: () => ({ answer: 'yes', reason: '' }), rewrite: (_e, entry) => `${entry.description} On a bench.` }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }])
      await save()
      await svc.whenIdle()
      expect((await svc.answerEdit({ mockupId: rows[1]!.id, action: 'undo' }))?.carry).toMatchObject({ state: 'offered', why: 'undone' })
    })

    it('keeps its why when an offer is dismissed and brought back', async () => {
      const svc = service(pileModel({ rewrite: (_e, entry) => entry.description }))
      const { rows, save } = await editedPile(svc, [{ description: 'One.', tags: [] }])
      await save()
      await svc.whenIdle()
      expect((await svc.answerEdit({ mockupId: rows[1]!.id, action: 'dismiss' }))?.carry).toMatchObject({ state: 'dismissed', why: 'unjudged' })
      expect((await svc.answerEdit({ mockupId: rows[1]!.id, action: 'restore' }))?.carry).toMatchObject({ state: 'offered', why: 'unjudged' })
    })
  })
})

describe("the person's answer to an offered edit", () => {
  async function offered(rewrite: (e: PileEdit, entry: PileEditEntry) => string | Promise<string> = (_e, entry) => `${entry.description} On a bench.`) {
    const svc = service(pileModel({ rewrite }))
    const [top, a, b] = pile('top', 'a', 'b')
    await svc.open()
    repo.drafts.updateDraft(top!.id, { title: 'top', description: 'On books.', tagIds: [tag('books').id] })
    for (const v of [a!, b!]) repo.drafts.updateDraft(v.id, { title: 'v', description: 'On a mesh floor.', tagIds: [tag('floor').id, tag('books').id] })
    await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'On a bench.', tagIds: [tag('bench').id] })
    return { svc, a: a!, b: b! }
  }

  it("applies exactly what the preview shows to that variant only, and keeps it from a late suggestion", async () => {
    const { svc, a, b } = await offered()
    await svc.whenIdle()
    const item = await svc.acceptEdit(a.id)
    expect(item).toMatchObject({ description: 'On a mesh floor. On a bench.', carry: { state: 'applied', after: { description: 'On a mesh floor. On a bench.', via: 'rewrite' } } })
    expect(labels(item!)).toEqual(['floor', 'bench'])
    expect(item!.carry!.tagsAdded.map((t) => t.label)).toEqual(['bench'])
    expect(item!.carry!.tagsRemoved.map((t) => t.label)).toEqual(['books'])
    expect(repo.drafts.getDraft(a.id)!.keptFields).toEqual(expect.arrayContaining(['description', 'tags']))
    expect(repo.drafts.getDraft(a.id)!.touched).toBe(false)
    expect((await itemOf(svc, b.id))).toMatchObject({ description: 'On a mesh floor.', carry: { state: 'offered' } })
  })

  it('waits for a version still being prepared, then applies it', async () => {
    const slow = later<string>()
    const { svc, a } = await offered(() => slow.promise)
    const accepting = svc.acceptEdit(a.id)
    slow.resolve('Ready now.')
    expect(await accepting).toMatchObject({ description: 'Ready now.', carry: { state: 'applied' } })
  })

  it("puts back the variant's own words on Undo, and offers the edit again", async () => {
    const { svc, a } = await offered()
    await svc.acceptEdit(a.id)
    const item = await svc.undoEdit(a.id)
    expect(item).toMatchObject({ description: 'On a mesh floor.', carry: { state: 'offered', after: { description: 'On a mesh floor. On a bench.' } } })
    expect(labels(item!)).toEqual(['floor', 'books'])
  })

  it('sets an offer aside on dismiss, and brings it back on restore', async () => {
    const { svc, a } = await offered()
    expect(await svc.dismissEdit(a.id)).toMatchObject({ description: 'On a mesh floor.', carry: { state: 'dismissed' } })
    expect(await svc.restoreEdit(a.id)).toMatchObject({ carry: { state: 'offered' } })
  })

  it('does nothing for a variant whose edit is not in that state', async () => {
    const { svc, a } = await offered()
    expect(await svc.undoEdit(a.id)).toBeNull()
    expect(await svc.restoreEdit(a.id)).toBeNull()
    await svc.dismissEdit(a.id)
    expect(await svc.acceptEdit(a.id)).toBeNull()
    expect(await svc.dismissEdit(9999)).toBeNull()
  })
})

describe('an accepted edit and the AI suggestions in a category it set', () => {
  /** A tag in Colour, a category the AI made. */
  const colour = (label: string) => {
    const category = repo.tags.getCategoryByLabel('Colour') ?? repo.tags.createCategory({ label: 'Colour', isCanonical: false })
    return repo.tags.getTagByNormalisedLabel(category.id, label) ?? repo.tags.createTag({ categoryId: category.id, label })
  }

  /**
   * A pile whose top goes from Beige and Black to Terracotta and Black. The variant's own
   * suggestion gave it Grey, Black and Indoor; it also has Cream, which no suggestion gave it.
   */
  async function colourPile(provider: InferenceProvider) {
    const svc = service(provider)
    const [top, v] = pile('top', 'v')
    ready(v!.id, {
      title: 'v',
      description: 'A grey mug indoors.',
      tags: [{ category: 'Colour', label: 'Grey' }, { category: 'Colour', label: 'Black' }, { category: 'Environment', label: 'Indoor' }]
    })
    await svc.open()
    repo.drafts.updateDraft(top!.id, { title: 'top', description: 'A beige mug.', tagIds: [colour('Beige').id, colour('Black').id] })
    repo.drafts.updateDraft(v!.id, { tagIds: [...repo.drafts.getDraft(v!.id)!.tagIds, colour('Cream').id] })
    await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'A terracotta mug.', tagIds: [colour('Terracotta').id, colour('Black').id] })
    await svc.whenIdle()
    return { svc, v: v! }
  }

  it("drops them on accept, as the preview shows, and keeps the top's own, the variant's other tags and other categories", async () => {
    const { svc, v } = await colourPile(pileModel({ rewrite: () => 'A terracotta mug indoors.' }))
    const offer = (await itemOf(svc, v.id)).carry!
    expect(offer.tagsAdded.map((t) => t.label)).toEqual(['Terracotta'])
    expect(offer.tagsRemoved.map((t) => t.label)).toEqual(['Grey'])

    const item = await svc.acceptEdit(v.id)
    expect(labels(item!)).toEqual(['Black', 'Indoor', 'Cream', 'Terracotta'])
    expect(item!.carry!.tagsRemoved.map((t) => t.label)).toEqual(['Grey'])
    expect(labels((await svc.undoEdit(v.id))!)).toEqual(['Grey', 'Black', 'Indoor', 'Cream'])
  })

  it('drops them when the model that judges pile edits applies the edit on a yes', async () => {
    const { svc, v } = await colourPile(pileModel({ check: () => ({ answer: 'yes', reason: '' }), rewrite: () => 'A terracotta mug indoors.' }))
    const item = await itemOf(svc, v.id)
    expect(item.carry).toMatchObject({ state: 'reworded' })
    expect(labels(item)).toEqual(['Black', 'Indoor', 'Cream', 'Terracotta'])
  })
})
