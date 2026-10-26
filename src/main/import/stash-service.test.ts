import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, sample } from '../db/repositories/__tests__/setup'
import { LookOverService } from './look-over-service'
import { StashService } from './stash-service'

let sqlite: Database.Database
let repo: Repository
let missing: Set<string>
let lookOver: LookOverService
let stash: StashService

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  seedTaxonomy(test.db)
  ensureSearchIndex(test.db)
  missing = new Set()
  const deps = {
    exists: async (p: string) => !missing.has(p),
    probe: async () => ({ width: 100, height: 100 })
  }
  lookOver = new LookOverService(repo, async () => null, deps)
  stash = new StashService(repo, lookOver, { exists: deps.exists })
})

afterEach(async () => {
  await lookOver.whenIdle()
  sqlite.close()
})

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
const pile = (...names: string[]) => {
  const rows = names.map((n) => waiting(n))
  repo.piles.createPile(rows.map((r) => r.id), rows[0]!.id)
  return rows
}
const phone = () => repo.tags.getAllTags().find((t) => t.label === 'Phone')!
const search = (q: string) => repo.library.getLibrary({ query: q, sort: 'date' }).map((r) => r.id)

describe('stash a pile', () => {
  it('writes every draft to its mockup at once and moves the pile into My Stash', async () => {
    const [top, side] = pile('phone_front', 'phone_side')
    await lookOver.open()
    await lookOver.saveDraft({ mockupId: top!.id, title: 'Clay phone', description: 'On a stand', tagIds: [phone().id] })

    const res = await stash.stashPile(top!.id)

    expect(res).toMatchObject({ ok: true })
    expect(res.ok && res.stashedIds.sort()).toEqual([top!.id, side!.id].sort())
    expect(repo.mockups.getMockup(top!.id)).toMatchObject({
      title: 'Clay phone',
      description: 'On a stand',
      stage: 'stashed'
    })
    // The top's edit was only offered on the variant, and nobody took it: it is stashed with its own words.
    expect(repo.mockups.getMockup(side!.id)).toMatchObject({ title: 'Clay phone', variation: 'side', variationSource: 'marker', description: '', stage: 'stashed' })
    expect(repo.mockups.getMockup(top!.id)).toMatchObject({ variation: 'front', variationSource: 'marker' })
    expect(repo.mockups.getTagsForMockup(side!.id)).toEqual([])
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([top!.id])
    expect(repo.inbox.getCounts()).toMatchObject({ toStash: 0 })
  })

  it('stashes the base and every variation, finds the pile by a variation, and Undo puts the drafts back', async () => {
    const [top, side] = pile('scroll_front', 'scroll_side')
    await lookOver.open()
    await lookOver.saveDraft({ mockupId: side!.id, title: 'Long scroll MacBook', variation: 'wavy surface', description: '', tagIds: [] })

    const res = await stash.stashPile(top!.id)

    expect([top!.id, side!.id].map((id) => repo.mockups.getMockup(id)).map((m) => [m!.title, m!.variation])).toEqual([
      ['Long scroll MacBook', 'front'],
      ['Long scroll MacBook', 'wavy surface']
    ])
    expect(search('wavy')).toEqual([top!.id])

    await stash.unstash(res.ok ? res.snapshot : (null as never))
    expect(repo.mockups.getMockup(side!.id)).toMatchObject({ stage: 'to_stash', variation: null })
    expect(repo.drafts.getDraft(side!.id)).toMatchObject({ title: 'Long scroll MacBook', variation: 'wavy surface', variationSource: 'typed' })
    expect(search('wavy')).toEqual([])
  })

  it('makes the pile searchable and keeps no drafts', async () => {
    const [top] = pile('a', 'b')
    await lookOver.saveDraft({ mockupId: top!.id, title: 'Findable', description: '', tagIds: [] })
    await stash.stashPile(top!.id)

    expect(search('Findable')).toEqual([top!.id])
    expect(repo.drafts.getDraft(top!.id)).toBeUndefined()
  })

  it('stashes a pile whose variants were never opened, with drafts filled from the top', async () => {
    const [top, side] = pile('a', 'b')
    const res = await stash.stashPile(top!.id)
    expect(res.ok).toBe(true)
    expect(repo.mockups.getMockup(side!.id)?.stage).toBe('stashed')
  })

  it('refuses the whole pile, changing nothing, if one cover is missing', async () => {
    const [top, side] = pile('a', 'b')
    await lookOver.open()
    missing.add(side!.coverPath)

    const res = await stash.stashPile(top!.id)

    expect(res).toEqual({ ok: false, reason: 'no-cover', mockupIds: [side!.id] })
    expect(repo.mockups.getMockup(top!.id)?.stage).toBe('to_stash')
    expect(repo.mockups.getMockup(side!.id)?.stage).toBe('to_stash')
    expect(repo.drafts.getDraft(top!.id)).toBeDefined()
  })

  it('refuses a mockup with no cover at all', async () => {
    const [top] = pile('a', 'b')
    repo.mockups.updateMockup(top!.id, { coverSource: 'none' })
    expect(await stash.stashPile(top!.id)).toMatchObject({ ok: false, reason: 'no-cover', mockupIds: [top!.id] })
  })

  it('refuses something that is not a pile waiting in To stash', async () => {
    const single = waiting('single')
    const [top] = pile('a', 'b')
    repo.mockups.setStage([top!.id], 'stashed')
    expect(await stash.stashPile(single.id)).toEqual({ ok: false, reason: 'not-ready', mockupIds: [single.id] })
    expect(await stash.stashPile(top!.id)).toEqual({ ok: false, reason: 'not-ready', mockupIds: [top!.id] })
    expect(await stash.stashPile(9999)).toEqual({ ok: false, reason: 'not-ready', mockupIds: [9999] })
  })

  it('is all or nothing if the database refuses part way', async () => {
    const [top, side] = pile('a', 'b')
    await lookOver.open()
    // Break the second mockup's draft so the commit fails after the first one was written.
    sqlite.prepare('DELETE FROM drafts WHERE mockup_id = ?').run(side!.id)
    const failing = new StashService(repo, { ...lookOver, draftsFor: async () => [
      { mockup: repo.mockups.getMockup(top!.id)!, draft: repo.drafts.getDraft(top!.id)! },
      { mockup: repo.mockups.getMockup(side!.id)!, draft: { ...repo.drafts.getDraft(top!.id)!, mockupId: side!.id } }
    ] } as unknown as LookOverService, { exists: async () => true })

    await expect(failing.stashPile(top!.id)).rejects.toThrow()

    expect(repo.mockups.getMockup(top!.id)).toMatchObject({ stage: 'to_stash', title: 'a' })
    expect(repo.drafts.getDraft(top!.id)).toBeDefined()
    expect(search('a')).toEqual([])
  })

  it('clears the Finish later pointer for the pile', async () => {
    const [top, side] = pile('a', 'b')
    await lookOver.setResume(top!.id, side!.id)
    await stash.stashPile(top!.id)
    expect(repo.drafts.getResume()).toBeUndefined()
  })
})

describe('stash a mockup on its own', () => {
  it('stashes it and refuses a pile or a member', async () => {
    const single = waiting('single')
    const [top, side] = pile('a', 'b')
    await lookOver.saveDraft({ mockupId: single.id, title: 'Solo', description: 'd', tagIds: [phone().id] })

    expect(await stash.stashSingle(top!.id)).toMatchObject({ ok: false, reason: 'not-ready' })
    expect(await stash.stashSingle(side!.id)).toMatchObject({ ok: false, reason: 'not-ready' })

    const res = await stash.stashSingle(single.id)
    expect(res).toMatchObject({ ok: true, stashedIds: [single.id] })
    expect(repo.mockups.getMockup(single.id)).toMatchObject({ title: 'Solo', stage: 'stashed' })
    expect(search('Solo')).toEqual([single.id])
  })
})

describe('undo', () => {
  it('puts a stashed pile back with its drafts, tags, stage and the pointer', async () => {
    const [top, side] = pile('a', 'b')
    await lookOver.saveDraft({ mockupId: top!.id, title: 'Edited', description: 'Words', tagIds: [phone().id] })
    await lookOver.setResume(top!.id, side!.id)
    await lookOver.whenIdle()
    const before = await lookOver.open()
    // The top's edit is on offer on the variant, and comes back with it.
    expect(before.units[0]!.items[1]!.carry).toMatchObject({ state: 'offered', after: { description: 'Words', via: 'copy' } })

    const res = await stash.stashPile(top!.id)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(search('Edited')).toEqual([top!.id])

    const back = await stash.unstash(res.snapshot)

    expect(back.restoredIds.sort()).toEqual([top!.id, side!.id].sort())
    expect(repo.mockups.getMockup(top!.id)).toMatchObject({ title: 'a', stage: 'to_stash' })
    expect(repo.mockups.getTagsForMockup(top!.id)).toEqual([])
    expect(search('Edited')).toEqual([])
    expect(repo.inbox.getCounts()).toMatchObject({ toStash: 1 })
    expect(await lookOver.open()).toEqual(before)
  })

  it('leaves out mockups that were deleted since', async () => {
    const [top, side] = pile('a', 'b')
    const res = await stash.stashPile(top!.id)
    if (!res.ok) throw new Error('expected ok')
    repo.trash.deleteMockupsHard([side!.id])

    expect((await stash.unstash(res.snapshot)).restoredIds).toEqual([top!.id])
  })

  it('does not clash when the same stash is undone twice', async () => {
    const [top] = pile('a', 'b')
    const res = await stash.stashPile(top!.id)
    if (!res.ok) throw new Error('expected ok')
    await stash.unstash(res.snapshot)
    await expect(stash.unstash(res.snapshot)).resolves.toBeDefined()
    expect(repo.mockups.getMockup(top!.id)?.stage).toBe('to_stash')
  })
})
