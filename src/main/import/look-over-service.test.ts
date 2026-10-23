import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { LookOverProgress } from '@shared/approval'
import type { InferenceProvider } from '@shared/inference'
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

afterEach(() => sqlite.close())

const service = (provider: InferenceProvider | null = null) =>
  new LookOverService(repo, async () => provider, { probe, exists }, (p) => progress.push(p))

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
const laptop = () => repo.tags.getAllTags().find((t) => t.label === 'Laptop')!

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

  it('asks the provider when nothing is cached, and falls back to the file name without one', async () => {
    waiting('my_phone-mockup')
    const analyze = vi.fn(async () => ({ title: 'Live title', description: 'd', tags: [] }))

    const live = (await service({ id: 's', name: 's', analyze }).open()).units[0]!.items[0]!
    expect(live.title).toBe('Live title')

    const m = repo.drafts.getQueueRoots()[0]!
    repo.drafts.deleteDrafts([m.id])
    const plain = (await service(null).open()).units[0]!.items[0]!
    expect(plain.title).toBe('my phone mockup')
  })

  it('keeps drafts between opens, so a title is not suggested twice', async () => {
    waiting('a')
    let n = 0
    const analyze = vi.fn(async () => ({ title: `Title ${++n}`, description: '', tags: [] }))
    const svc = service({ id: 's', name: 's', analyze })

    const first = (await svc.open()).units[0]!.items[0]!.title
    const second = (await svc.open()).units[0]!.items[0]!.title

    expect(second).toBe(first)
    expect(analyze).toHaveBeenCalledTimes(1)
  })

  it('starts each variant with its own cached suggestion, tags snapped like the top\'s', async () => {
    const [top, side] = pile('phone_front', 'phone_side')
    ready(top!.id, { title: 'Clay phone', description: 'On a stand', tags: [{ category: 'Device', label: 'Phone' }] })
    ready(side!.id, { title: 'Clay phone, side', description: 'Edge on', tags: [{ category: 'Device', label: 'Laptop' }] })

    const items = (await service().open()).units[0]!.items

    expect(items[1]).toMatchObject({ mockupId: side!.id, title: 'Clay phone, side', description: 'Edge on', waitingForAi: false })
    expect(items[1]!.tags.map((t) => t.label)).toEqual(['Laptop'])
  })

  it('fills a variant the AI hasn\'t finished from its name and the top, and says it is waiting', async () => {
    const [top, side] = pile('phone_front', 'phone_side')
    ready(top!.id, { title: 'Clay phone', description: 'On a stand', tags: [{ category: 'Device', label: 'Phone' }] })
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })

    const items = (await service().open()).units[0]!.items

    expect(items[0]!.waitingForAi).toBe(false)
    expect(items[1]).toMatchObject({ title: 'phone side', description: 'On a stand', waitingForAi: true })
    expect(items[1]!.tags.map((t) => t.label)).toEqual(['Phone'])
  })

  it('never asks the provider for a variant: the background queue reads those', async () => {
    const [top, side, back] = pile('top', 'side', 'back')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    repo.mockups.updateMockup(back!.id, { aiStatus: 'sniffing' })
    const analyze = vi.fn<InferenceProvider['analyze']>(async () => ({ title: 'Live', description: '', tags: [] }))

    await service({ id: 's', name: 's', analyze }).open()

    expect(analyze).toHaveBeenCalledTimes(1)
    expect(analyze.mock.calls[0]![0]).toMatchObject({ fileName: 'top.psd' })
    expect(top).toBeDefined()
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

  it('marks a variant touched when the user changes it, but not when nothing changed', async () => {
    const [, side] = pile('top', 'side')
    const svc = service()
    const before = (await svc.open()).units[0]!.items[1]!

    await svc.saveDraft({ mockupId: side!.id, title: before.title, description: before.description, tagIds: before.tags.map((t) => t.tagId) })
    expect((await svc.open()).units[0]!.items[1]!.touched).toBe(false)

    await svc.saveDraft({ mockupId: side!.id, title: 'Side, retitled', description: before.description, tagIds: [] })
    expect((await svc.open()).units[0]!.items[1]!).toMatchObject({ touched: true, title: 'Side, retitled' })
  })

  it('carries a changed description and tags from the top to variants not yet touched, and says how far it got', async () => {
    const [top, a, b, c] = pile('top', 'a', 'b', 'c')
    const svc = service()
    await svc.open()
    await svc.saveDraft({ mockupId: b!.id, title: 'b mine', description: 'b own', tagIds: [laptop().id] })

    const res = await svc.saveDraft({
      mockupId: top!.id,
      title: 'Top retitled',
      description: 'Shared words',
      tagIds: [phone().id]
    })

    expect(res.propagatedIds.sort()).toEqual([a!.id, c!.id].sort())
    const items = (await svc.open()).units[0]!.items
    const by = (id: number) => items.find((i) => i.mockupId === id)!
    expect(by(a!.id)).toMatchObject({ description: 'Shared words', title: 'a' })
    expect(by(a!.id).tags.map((t) => t.label)).toEqual(['Phone'])
    expect(by(c!.id).description).toBe('Shared words')
    // The one the user edited keeps its own.
    expect(by(b!.id)).toMatchObject({ title: 'b mine', description: 'b own' })
    expect(by(b!.id).tags.map((t) => t.label)).toEqual(['Laptop'])
    // The top's title is its own and never copied.
    expect(by(a!.id).title).not.toBe('Top retitled')

    expect(progress.at(-1)).toEqual({ pileId: top!.id, completed: 2, total: 2, phase: 'done' })
    expect(progress[0]).toMatchObject({ pileId: top!.id, completed: 0, total: 2, phase: 'running' })
  })

  it('does not carry anything over when only the top\'s title changed', async () => {
    const [top, a] = pile('top', 'a')
    const svc = service()
    const first = (await svc.open()).units[0]!.items[0]!

    const res = await svc.saveDraft({
      mockupId: top!.id,
      title: 'Only the title',
      description: first.description,
      tagIds: first.tags.map((t) => t.tagId)
    })

    expect(res.propagatedIds).toEqual([])
    expect(progress).toEqual([])
    expect(a).toBeDefined()
  })

  it('does not carry anything from a variant or a mockup on its own', async () => {
    const [, side] = pile('top', 'side')
    const alone = waiting('alone')
    const svc = service()
    await svc.open()
    expect((await svc.saveDraft({ mockupId: side!.id, title: 's', description: 'x', tagIds: [] })).propagatedIds).toEqual([])
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

  it('replaces a waiting variant\'s fallback and stops waiting, once', async () => {
    const [, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const svc = service()
    await svc.open()

    expect(await svc.settle(side!.id)).toBeNull()
    ready(side!.id, landed)
    const item = await svc.settle(side!.id)

    expect(item).toMatchObject({ mockupId: side!.id, role: 'variant', title: 'Blue scroll Macbook', description: 'A long page', waitingForAi: false })
    expect(item!.tags.map((t) => t.label)).toEqual(['Laptop'])
    expect(await svc.settle(side!.id)).toBeNull()
    expect((await svc.open()).units[0]!.items[1]).toMatchObject({ title: 'Blue scroll Macbook', waitingForAi: false })
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

  it('keeps the description and tags a carry-over from the top set, and still takes the title', async () => {
    const [top, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    const svc = service()
    await svc.open()
    await svc.saveDraft({ mockupId: top!.id, title: 'top', description: 'Shared words', tagIds: [phone().id] })

    ready(side!.id, landed)
    const item = await svc.settle(side!.id)

    expect(item).toMatchObject({ title: 'Blue scroll Macbook', description: 'Shared words', waitingForAi: false })
    expect(item!.tags.map((t) => t.label)).toEqual(['Phone'])
  })

  it('upgrades a top or a mockup on its own whose provider call failed when it opened', async () => {
    const alone = waiting('my_mockup')
    repo.mockups.updateMockup(alone.id, { aiStatus: 'pending' })
    const analyze = vi.fn(async () => {
      throw new Error('busy')
    })
    const svc = service({ id: 's', name: 's', analyze })
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

    expect(await svc.settle(side!.id)).toMatchObject({ title: 'side', waitingForAi: false })
    expect(await svc.settle(back!.id)).toMatchObject({ title: 'back', waitingForAi: false })
  })

  it('catches up on open when the suggestion landed while Look it over was shut', async () => {
    const [, side] = pile('top', 'side')
    repo.mockups.updateMockup(side!.id, { aiStatus: 'pending' })
    await service().open()

    ready(side!.id, landed)

    expect((await service().open()).units[0]!.items[1]).toMatchObject({ title: 'Blue scroll Macbook', waitingForAi: false })
  })

  it('has nothing to say for a mockup with no draft or not in To stash', async () => {
    const [, side] = pile('top', 'side')
    ready(side!.id, landed)
    expect(await service().settle(side!.id)).toBeNull()
    expect(await service().settle(9999)).toBeNull()
  })
})
