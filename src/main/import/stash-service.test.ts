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

afterEach(() => sqlite.close())

const waiting = (name: string, extra = {}) => {
  const m = repo.createMockup({
    ...sample,
    title: name,
    libraryPath: `/lib/${name}.psd`,
    coverPath: `/lib/${name}.webp`,
    importContext: { batchId: 'b', folderTrail: [], originalFilename: `${name}.psd` },
    ...extra
  })
  repo.setStage([m.id], 'to_stash')
  return m
}
const pile = (...names: string[]) => {
  const rows = names.map((n) => waiting(n))
  repo.createPile(rows.map((r) => r.id), rows[0]!.id)
  return rows
}
const phone = () => repo.getAllTags().find((t) => t.label === 'Phone')!
const search = (q: string) => repo.getLibrary({ query: q, sort: 'date' }).map((r) => r.id)

describe('stash a pile', () => {
  it('writes every draft to its mockup at once and moves the pile into My Stash', async () => {
    const [top, side] = pile('phone_front', 'phone_side')
    await lookOver.open()
    await lookOver.saveDraft({ mockupId: top!.id, title: 'Clay phone', description: 'On a stand', tagIds: [phone().id] })

    const res = await stash.stashPile(top!.id)

    expect(res).toMatchObject({ ok: true })
    expect(res.ok && res.stashedIds.sort()).toEqual([top!.id, side!.id].sort())
    expect(repo.getMockup(top!.id)).toMatchObject({
      title: 'Clay phone',
      description: 'On a stand',
      stage: 'stashed'
    })
    // The variant took the top's description and tags, and kept its own name.
    expect(repo.getMockup(side!.id)).toMatchObject({ title: 'phone side', description: 'On a stand', stage: 'stashed' })
    expect(repo.getTagsForMockup(side!.id).map((t) => t.label)).toEqual(['Phone'])
    expect(repo.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([top!.id])
    expect(repo.getInboxCounts()).toMatchObject({ toStash: 0 })
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
    expect(repo.getMockup(side!.id)?.stage).toBe('stashed')
  })

  it('refuses the whole pile, changing nothing, if one cover is missing', async () => {
    const [top, side] = pile('a', 'b')
    await lookOver.open()
    missing.add(side!.coverPath)

    const res = await stash.stashPile(top!.id)

    expect(res).toEqual({ ok: false, reason: 'no-cover', mockupIds: [side!.id] })
    expect(repo.getMockup(top!.id)?.stage).toBe('to_stash')
    expect(repo.getMockup(side!.id)?.stage).toBe('to_stash')
    expect(repo.drafts.getDraft(top!.id)).toBeDefined()
  })

  it('refuses a mockup with no cover at all', async () => {
    const [top] = pile('a', 'b')
    repo.updateMockup(top!.id, { coverSource: 'none' })
    expect(await stash.stashPile(top!.id)).toMatchObject({ ok: false, reason: 'no-cover', mockupIds: [top!.id] })
  })

  it('refuses something that is not a pile waiting in To stash', async () => {
    const single = waiting('single')
    const [top] = pile('a', 'b')
    repo.setStage([top!.id], 'stashed')
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
      { mockup: repo.getMockup(top!.id)!, draft: repo.drafts.getDraft(top!.id)! },
      { mockup: repo.getMockup(side!.id)!, draft: { ...repo.drafts.getDraft(top!.id)!, mockupId: side!.id } }
    ] } as unknown as LookOverService, { exists: async () => true })

    await expect(failing.stashPile(top!.id)).rejects.toThrow()

    expect(repo.getMockup(top!.id)).toMatchObject({ stage: 'to_stash', title: 'a' })
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
    expect(repo.getMockup(single.id)).toMatchObject({ title: 'Solo', stage: 'stashed' })
    expect(search('Solo')).toEqual([single.id])
  })
})

describe('undo', () => {
  it('puts a stashed pile back with its drafts, tags, stage and the pointer', async () => {
    const [top, side] = pile('a', 'b')
    await lookOver.saveDraft({ mockupId: top!.id, title: 'Edited', description: 'Words', tagIds: [phone().id] })
    await lookOver.setResume(top!.id, side!.id)
    const before = await lookOver.open()

    const res = await stash.stashPile(top!.id)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(search('Edited')).toEqual([top!.id])

    const back = await stash.unstash(res.snapshot)

    expect(back.restoredIds.sort()).toEqual([top!.id, side!.id].sort())
    expect(repo.getMockup(top!.id)).toMatchObject({ title: 'a', stage: 'to_stash' })
    expect(repo.getTagsForMockup(top!.id)).toEqual([])
    expect(search('Edited')).toEqual([])
    expect(repo.getInboxCounts()).toMatchObject({ toStash: 1 })
    expect(await lookOver.open()).toEqual(before)
  })

  it('leaves out mockups that were deleted since', async () => {
    const [top, side] = pile('a', 'b')
    const res = await stash.stashPile(top!.id)
    if (!res.ok) throw new Error('expected ok')
    repo.deleteMockupsHard([side!.id])

    expect((await stash.unstash(res.snapshot)).restoredIds).toEqual([top!.id])
  })

  it('does not clash when the same stash is undone twice', async () => {
    const [top] = pile('a', 'b')
    const res = await stash.stashPile(top!.id)
    if (!res.ok) throw new Error('expected ok')
    await stash.unstash(res.snapshot)
    await expect(stash.unstash(res.snapshot)).resolves.toBeDefined()
    expect(repo.getMockup(top!.id)?.stage).toBe('to_stash')
  })
})
