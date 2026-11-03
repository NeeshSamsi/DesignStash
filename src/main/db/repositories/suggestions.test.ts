import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import { TagService } from '../tag-service'
import { approvedMockup, createTestDb, sample } from './__tests__/setup'

// F-034, decided by Neesh: an AI suggestion becomes a tag only when it lands on a mockup (accepted,
// or stashed with it). Dismissed or skipped ones leave nothing; tags a person made stay.

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  seedTaxonomy(test.db)
  ensureSearchIndex(test.db)
})

afterEach(() => sqlite.close())

type Suggested = { category: string; label: string }[]

/** A mockup waiting in To stash with the AI's suggestion, and the draft Look it over makes from it. */
const waiting = async (name: string, tags: Suggested) => {
  const m = repo.mockups.createMockup({
    ...sample,
    title: name,
    libraryPath: `/lib/${name}.psd`,
    stage: 'to_stash',
    aiStatus: 'ready',
    aiResult: { title: name, description: '', tags }
  })
  const tagIds = await new TagService(repo).snapTags(tags)
  repo.drafts.ensureDraft(m.id, { title: name, description: '', tagIds })
  return { m, tagIds }
}

/** What Settings › Tags, the tag filter and the tag matches list, as `Category/Tag`. */
const listed = () =>
  repo.tags.getTagTree().flatMap((c) => [c.categoryLabel, ...c.tags.map((t) => `${c.categoryLabel}/${t.label}`)])

const tagById = (id: number) => repo.tags.getAllTags().find((t) => t.id === id)
const categoryNamed = (label: string) => repo.tags.getCategoryByLabel(label)

describe('AI suggestions are not tags until they land on a mockup', () => {
  it('a suggestion is not listed, nor a category made only for suggestions', async () => {
    await waiting('mug', [
      { category: 'Colour', label: 'Beige' },
      { category: 'Device', label: 'Foldable' }
    ])

    expect(listed()).not.toContain('Colour')
    expect(listed()).not.toContain('Device/Foldable')
    expect(listed()).toContain('Device/Laptop')
  })

  it('becomes a tag, with its category, when it is stashed on its mockup', async () => {
    const { m, tagIds } = await waiting('mug', [{ category: 'Colour', label: 'Beige' }])

    repo.drafts.stash(m.id, [m.id])

    expect(listed()).toEqual(expect.arrayContaining(['Colour', 'Colour/Beige']))
    expect(tagById(tagIds[0]!)?.createdBy).toBe('ai')
  })

  it('becomes a tag when it lands on a mockup any other way', async () => {
    const { tagIds } = await waiting('mug', [{ category: 'Colour', label: 'Beige' }])
    const stashed = repo.mockups.createMockup(approvedMockup({ title: 'Cup', libraryPath: '/lib/cup.psd' }))

    repo.mockups.addTagToMockup(stashed.id, tagIds[0]!)

    expect(listed()).toContain('Colour/Beige')
  })

  it('one dismissed before the stash leaves nothing behind, nor its category', async () => {
    const { m, tagIds } = await waiting('mug', [
      { category: 'Colour', label: 'Beige' },
      { category: 'Mood', label: 'Warm' }
    ])
    const [beige, warm] = tagIds as [number, number]
    repo.drafts.updateDraft(m.id, { tagIds: [beige] })

    repo.drafts.stash(m.id, [m.id])

    expect(tagById(warm)).toBeUndefined()
    expect(categoryNamed('Mood')).toBeUndefined()
    expect(tagById(beige)?.createdBy).toBe('ai')
  })

  it('a dismissed one stays while its mockup waits, so Undo in Look it over can bring it back', async () => {
    const { m, tagIds } = await waiting('mug', [{ category: 'Colour', label: 'Beige' }])
    repo.drafts.updateDraft(m.id, { tagIds: [] })

    repo.tags.pruneSuggestions()

    expect(tagById(tagIds[0]!)?.createdBy).toBe('suggestion')
  })

  it('one another waiting mockup still holds stays a suggestion when the first is stashed', async () => {
    const a = await waiting('a', [{ category: 'Colour', label: 'Beige' }])
    const b = await waiting('b', [{ category: 'Colour', label: 'Beige' }])
    expect(b.tagIds).toEqual(a.tagIds)
    repo.drafts.updateDraft(a.m.id, { tagIds: [] })

    repo.drafts.stash(a.m.id, [a.m.id])

    expect(tagById(a.tagIds[0]!)?.createdBy).toBe('suggestion')
  })

  it('a skipped mockup’s suggestions go once it is gone', async () => {
    const { m, tagIds } = await waiting('mug', [{ category: 'Colour', label: 'Beige' }])
    repo.mockups.deleteMockup(m.id)

    repo.tags.pruneSuggestions()

    expect(tagById(tagIds[0]!)).toBeUndefined()
    expect(categoryNamed('Colour')).toBeUndefined()
  })

  it('never prunes a tag a person made, or one that landed, even at no mockups', async () => {
    const device = categoryNamed('Device')!
    const mine = repo.tags.createTag({ label: 'Clay', categoryId: device.id, createdBy: 'user' })
    const { m, tagIds } = await waiting('mug', [{ category: 'Colour', label: 'Beige' }])
    repo.drafts.stash(m.id, [m.id])
    repo.mockups.clearTagsForMockup(m.id)

    repo.tags.pruneSuggestions()

    expect(tagById(mine.id)).toBeDefined()
    expect(tagById(tagIds[0]!)).toBeDefined()
    expect(listed()).toEqual(expect.arrayContaining(['Device/Clay', 'Colour/Beige']))
  })
})
