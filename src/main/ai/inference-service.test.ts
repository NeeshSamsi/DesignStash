import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import type { NewMockup } from '../db/schema'
import { Repository } from '../db/repository'
import { TagService } from '../db/tag-service'
import { MockInferenceProvider } from '../../shared/mock-inference'
import { InferenceService } from './inference-service'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository
let tagService: TagService
let service: InferenceService

const baseMockup: NewMockup = {
  title: 'test.psd',
  libraryPath: '/lib/mockups/a/original.psd',
  coverPath: '/lib/mockups/a/cover.png',
  coverSource: 'embedded'
}

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  repo = new Repository(db)
  tagService = new TagService(repo)
  service = new InferenceService(repo, tagService, new MockInferenceProvider())
})

afterEach(() => sqlite.close())

describe('InferenceService.analyzeMockup', () => {
  it('writes title and description to the mockup', async () => {
    const m = repo.createMockup(baseMockup)
    await service.analyzeMockup(m.id, {
      imagePath: m.coverPath,
      fileName: 'laptop-hero.psd',
      folderTrail: []
    })

    const updated = repo.getMockup(m.id)!
    expect(updated.title).toBe('laptop-hero Mockup')
    expect(updated.description).toContain('laptop-hero.psd')
  })

  it('snaps and links tags; does not flip review_status', async () => {
    const m = repo.createMockup(baseMockup)
    await service.analyzeMockup(m.id, {
      imagePath: m.coverPath,
      fileName: 'homepage.psd',
      folderTrail: []
    })

    const linked = repo.getTagsForMockup(m.id)
    expect(linked.length).toBeGreaterThan(0)
    expect(repo.getMockup(m.id)!.reviewStatus).toBe('needs_review')
  })

  it('clears existing tags before applying new ones (no duplicates on re-inference)', async () => {
    const m = repo.createMockup(baseMockup)
    await service.analyzeMockup(m.id, {
      imagePath: m.coverPath,
      fileName: 'hero.psd',
      folderTrail: []
    })
    const countAfterFirst = repo.getTagsForMockup(m.id).length

    await service.analyzeMockup(m.id, {
      imagePath: m.coverPath,
      fileName: 'hero.psd',
      folderTrail: []
    })
    const countAfterSecond = repo.getTagsForMockup(m.id).length

    expect(countAfterSecond).toBe(countAfterFirst)
  })
})

describe('InferenceService.reinferGroup', () => {
  it('propagates ground truth to non-edited siblings and skips user-edited ones', async () => {
    // Group parent
    const parent = repo.createMockup({ ...baseMockup, title: 'Group', isGroup: true })

    // Sibling A: user-edited (the ground truth variant in M6 flow)
    const sibA = repo.createMockup({
      ...baseMockup,
      title: 'Variant A',
      groupId: parent.id,
      importContext: { userEdited: true }
    })

    // Sibling B: not edited — should be re-inferred
    const sibB = repo.createMockup({
      ...baseMockup,
      title: 'Variant B',
      groupId: parent.id
    })

    // Sibling C: user hand-edited — should be skipped
    const sibC = repo.createMockup({
      ...baseMockup,
      title: 'Variant C',
      groupId: parent.id,
      importContext: { userEdited: true }
    })

    const groundTruth = {
      title: 'MacBook Mockup',
      description: 'A MacBook on a desk.',
      tags: [{ category: 'Device', label: 'MacBook' }]
    }

    await service.reinferGroup(parent.id, groundTruth)

    // B should be updated by MockProvider (title becomes "Variant B Mockup")
    expect(repo.getMockup(sibB.id)!.title).toBe('Variant B Mockup')
    expect(repo.getTagsForMockup(sibB.id).length).toBeGreaterThan(0)

    // A and C should be unchanged (userEdited: true)
    expect(repo.getMockup(sibA.id)!.title).toBe('Variant A')
    expect(repo.getMockup(sibC.id)!.title).toBe('Variant C')
    expect(repo.getTagsForMockup(sibA.id)).toHaveLength(0)
    expect(repo.getTagsForMockup(sibC.id)).toHaveLength(0)
  })

  it('is a no-op for a group where all siblings are user-edited', async () => {
    const parent = repo.createMockup({ ...baseMockup, title: 'Group', isGroup: true })
    const sib = repo.createMockup({
      ...baseMockup,
      title: 'Solo',
      groupId: parent.id,
      importContext: { userEdited: true }
    })

    await service.reinferGroup(parent.id, { title: 'X', description: 'Y', tags: [] })

    expect(repo.getMockup(sib.id)!.title).toBe('Solo')
  })
})

describe('InferenceService.setProvider', () => {
  it('hot-swaps the provider', async () => {
    const m = repo.createMockup(baseMockup)

    const customProvider = {
      id: 'custom',
      name: 'Custom',
      analyze: async () => ({
        title: 'Custom Title',
        description: 'Custom desc',
        tags: []
      })
    }

    service.setProvider(customProvider)
    await service.analyzeMockup(m.id, { imagePath: m.coverPath, fileName: 'x.psd', folderTrail: [] })

    expect(repo.getMockup(m.id)!.title).toBe('Custom Title')
  })
})
