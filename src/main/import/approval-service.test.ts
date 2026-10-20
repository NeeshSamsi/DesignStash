import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import type { NewMockup } from '../db/schema'
import { Repository } from '../db/repository'
import { TagService } from '../db/tag-service'
import { ApprovalService } from './approval-service'
import type { InferenceProvider, AnalysisInput, InferenceResult } from '@shared/inference'
import type { ApprovalItem, ApproveItemRequest } from '@shared/approval'

const mockProvider: InferenceProvider = {
  id: 'mock',
  name: 'Mock',
  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    return { title: `AI: ${input.fileName}`, description: 'mock desc', tags: [] }
  }
}

const failProvider: InferenceProvider = {
  id: 'fail',
  name: 'Fail',
  async analyze(): Promise<InferenceResult> {
    throw new Error('inference failed')
  }
}

const makeMockup = (batchId: string, overrides: Partial<NewMockup> = {}): NewMockup => ({
  title: 'Test Mockup',
  libraryPath: `/lib/${batchId}/original.psd`,
  coverPath: `/lib/${batchId}/cover.png`,
  coverSource: 'embedded',
  importContext: { batchId, folderTrail: [], originalFilename: 'file.psd' },
  ...overrides
})

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  repo = new Repository(db)
})

afterEach(() => sqlite.close())

describe('ApprovalService.initQueue with suggestions from the background queue', () => {
  const cached: InferenceResult = {
    title: 'Clay iPhone 15 Pro',
    description: 'A phone on a clay stand',
    tags: [{ category: 'Device', label: 'phone' }]
  }

  const countingProvider = () => {
    const calls: AnalysisInput[] = []
    const provider: InferenceProvider = {
      id: 'count',
      name: 'Count',
      async analyze(input) {
        calls.push(input)
        return { title: 'live', description: '', tags: [] }
      }
    }
    return { provider, calls }
  }

  it('uses a finished suggestion without asking the provider again, even with no provider', async () => {
    const m = repo.createMockup(makeMockup('c1'))
    repo.updateMockup(m.id, { aiStatus: 'ready', aiResult: cached })
    const { provider, calls } = countingProvider()

    const withProvider = await new ApprovalService(repo, provider).initQueue('c1')
    const withoutProvider = await new ApprovalService(repo, null).initQueue('c1')

    expect(calls).toHaveLength(0)
    for (const queue of [withProvider, withoutProvider]) {
      expect(queue.items[0]).toMatchObject({
        title: 'Clay iPhone 15 Pro',
        description: 'A phone on a clay stand'
      })
      expect(queue.items[0]!.tags.map((t) => t.label)).toEqual(['phone'])
    }
  })

  it('reads a whole pile from the cache', async () => {
    const leader = repo.createMockup(makeMockup('c2', { isGroup: true }))
    const member = repo.createMockup(makeMockup('c2', { libraryPath: '/lib/c2/m.psd', groupId: leader.id }))
    repo.updateMockup(leader.id, { aiStatus: 'ready', aiResult: { ...cached, title: 'Top' } })
    repo.updateMockup(member.id, { aiStatus: 'ready', aiResult: { ...cached, title: 'Side' } })
    const { provider, calls } = countingProvider()

    const queue = await new ApprovalService(repo, provider).initQueue('c2')

    expect(calls).toHaveLength(0)
    expect(queue.items.map((i) => i.title)).toEqual(['Top', 'Side'])
  })

  it('still asks the provider for a mockup whose suggestion is not ready, failed, or unreadable', async () => {
    const pending = repo.createMockup(makeMockup('c3', { libraryPath: '/lib/c3/p.psd' }))
    const failed = repo.createMockup(makeMockup('c3', { libraryPath: '/lib/c3/f.psd' }))
    const broken = repo.createMockup(makeMockup('c3', { libraryPath: '/lib/c3/b.psd' }))
    repo.updateMockup(pending.id, { aiStatus: 'sniffing' })
    repo.updateMockup(failed.id, { aiStatus: 'failed' })
    repo.updateMockup(broken.id, { aiStatus: 'ready', aiResult: { title: 5 } })
    const { provider, calls } = countingProvider()

    const queue = await new ApprovalService(repo, provider).initQueue('c3')

    expect(calls).toHaveLength(3)
    expect(queue.items.every((i) => i.title === 'live')).toBe(true)
  })
})

describe('ApprovalService.initQueue', () => {
  it('returns all items from batch with AI-suggested titles', async () => {
    repo.createMockup(makeMockup('b1', { title: 'A', libraryPath: '/lib/b1/a.psd', importContext: { batchId: 'b1', folderTrail: [], originalFilename: 'a.psd' } }))
    repo.createMockup(makeMockup('b1', { title: 'B', libraryPath: '/lib/b1/b.psd', importContext: { batchId: 'b1', folderTrail: [], originalFilename: 'b.psd' } }))

    const service = new ApprovalService(repo, mockProvider)
    const queue = await service.initQueue('b1')

    expect(queue.batchId).toBe('b1')
    expect(queue.items).toHaveLength(2)
    expect(queue.items.every((i) => i.title.startsWith('AI: '))).toBe(true)
  })

  it('falls back to filename when provider is null', async () => {
    repo.createMockup(makeMockup('b2', { title: 'My Mockup', libraryPath: '/lib/b2/my-mockup.psd', importContext: { batchId: 'b2', folderTrail: [], originalFilename: 'my-mockup.psd' } }))

    const service = new ApprovalService(repo, null)
    const queue = await service.initQueue('b2')

    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]!.title).not.toMatch(/^AI: /)
    expect(queue.items[0]!.title).toBe('my mockup')
  })

  it('falls back to filename when provider throws', async () => {
    repo.createMockup(makeMockup('b3', { title: 'Fallback', libraryPath: '/lib/b3/fallback.psd', importContext: { batchId: 'b3', folderTrail: [], originalFilename: 'fallback-item.psd' } }))

    const service = new ApprovalService(repo, failProvider)
    const queue = await service.initQueue('b3')

    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]!.title).not.toMatch(/^AI: /)
    expect(queue.items[0]!.title).toBe('fallback item')
  })

  it('singletons have isLeader=false and variantIndex=0', async () => {
    repo.createMockup(makeMockup('b4', { title: 'S1', libraryPath: '/lib/b4/s1.psd' }))
    repo.createMockup(makeMockup('b4', { title: 'S2', libraryPath: '/lib/b4/s2.psd' }))

    const service = new ApprovalService(repo, null)
    const queue = await service.initQueue('b4')

    expect(queue.items).toHaveLength(2)
    expect(queue.items.every((i) => i.isLeader === false)).toBe(true)
    expect(queue.items.every((i) => i.variantIndex === 0)).toBe(true)
  })

  it('group leader comes first, members follow in id order with correct indices', async () => {
    const leader = repo.createMockup(makeMockup('b5', { title: 'Leader', libraryPath: '/lib/b5/leader.psd', isGroup: true, importContext: { batchId: 'b5', folderTrail: [], originalFilename: 'leader.psd' } }))
    const m1 = repo.createMockup(makeMockup('b5', { title: 'Member1', libraryPath: '/lib/b5/m1.psd', groupId: leader.id, importContext: { batchId: 'b5', folderTrail: [], originalFilename: 'm1.psd' } }))
    const m2 = repo.createMockup(makeMockup('b5', { title: 'Member2', libraryPath: '/lib/b5/m2.psd', groupId: leader.id, importContext: { batchId: 'b5', folderTrail: [], originalFilename: 'm2.psd' } }))

    const service = new ApprovalService(repo, null)
    const queue = await service.initQueue('b5')

    expect(queue.items).toHaveLength(3)
    expect(queue.items[0]!.mockupId).toBe(leader.id)
    expect(queue.items[0]!.isLeader).toBe(true)
    expect(queue.items[0]!.variantIndex).toBe(0)
    expect(queue.items[0]!.leaderId).toBeNull()

    const memberIds = [m1.id, m2.id].sort((a, b) => a - b)
    expect(queue.items[1]!.mockupId).toBe(memberIds[0])
    expect(queue.items[1]!.variantIndex).toBe(1)
    expect(queue.items[1]!.leaderId).toBe(leader.id)

    expect(queue.items[2]!.mockupId).toBe(memberIds[1])
    expect(queue.items[2]!.variantIndex).toBe(2)
    expect(queue.items[2]!.leaderId).toBe(leader.id)
  })

  it('returns empty queue for nonexistent batchId', async () => {
    const service = new ApprovalService(repo, null)
    const queue = await service.initQueue('nonexistent')

    expect(queue).toEqual({ batchId: 'nonexistent', items: [] })
  })
})

describe('Re-inference propagation — MacBook test', () => {
  it('propagates edited leader title to group members via re-inference', async () => {
    let lastAnalysisInput: import('@shared/inference').AnalysisInput | null = null
    const contextAwareProvider: InferenceProvider = {
      id: 'context-aware',
      name: 'ContextAware',
      async analyze(input: import('@shared/inference').AnalysisInput): Promise<InferenceResult> {
        lastAnalysisInput = input
        if (input.groupContext?.originalTitle) {
          return {
            title: `${input.groupContext.originalTitle} (variant)`,
            description: `Matches ${input.groupContext.originalTitle}`,
            tags: []
          }
        }
        return { title: 'Laptop', description: 'Generic laptop', tags: [] }
      }
    }

    const leader = repo.createMockup({ title: 'Laptop A', libraryPath: '/lib/a.psd', coverPath: '/c/a.png', coverSource: 'embedded', isGroup: true, importContext: { batchId: 'b', folderTrail: [], originalFilename: 'laptop-A.psd' } })
    const m2 = repo.createMockup({ title: 'Laptop B', libraryPath: '/lib/b.psd', coverPath: '/c/b.png', coverSource: 'embedded', groupId: leader.id, importContext: { batchId: 'b', folderTrail: [], originalFilename: 'laptop-B.psd' } })
    const m3 = repo.createMockup({ title: 'Laptop C', libraryPath: '/lib/c.psd', coverPath: '/c/c.png', coverSource: 'embedded', groupId: leader.id, importContext: { batchId: 'b', folderTrail: [], originalFilename: 'laptop-C.psd' } })

    const service = new ApprovalService(repo, contextAwareProvider)
    const queue = await service.initQueue('b')

    const memberItems = queue.items.filter((i) => !i.isLeader)
    expect(memberItems).toHaveLength(2)

    const editedLeader: ApproveItemRequest = {
      mockupId: leader.id,
      title: 'MacBook',
      description: 'A great MacBook mockup',
      tagIds: [],
      coverPath: leader.coverPath,
      coverSource: 'embedded',
      isLeader: true,
      wasEdited: true,
      leaderId: null
    }

    const reinferred = await service.reinferGroupRemainder(memberItems, editedLeader)

    expect(reinferred).toHaveLength(2)
    expect(reinferred[0]!.title).toBe('MacBook (variant)')
    expect(reinferred[1]!.title).toBe('MacBook (variant)')
    // TypeScript can't narrow the captured variable through async closure; assert non-null first
    expect(lastAnalysisInput).not.toBeNull()
    expect(lastAnalysisInput!.groupContext?.originalTitle).toBe('MacBook')

    // suppress unused variable warnings
    void m2
    void m3
  })
})

describe('ApprovalService.reinferGroupRemainder', () => {
  it('updates item titles using group context', async () => {
    const m1 = repo.createMockup(makeMockup('b6', { title: 'Member A', libraryPath: '/lib/b6/a.psd', importContext: { batchId: 'b6', folderTrail: [], originalFilename: 'member-a.psd' } }))
    const m2 = repo.createMockup(makeMockup('b6', { title: 'Member B', libraryPath: '/lib/b6/b.psd', importContext: { batchId: 'b6', folderTrail: [], originalFilename: 'member-b.psd' } }))

    const items: ApprovalItem[] = [
      { mockupId: m1.id, leaderId: 1, isLeader: false, variantIndex: 1, title: 'Old A', description: '', tags: [], coverPath: '/cover-a.png', coverSource: 'embedded', sidecarFileName: null },
      { mockupId: m2.id, leaderId: 1, isLeader: false, variantIndex: 2, title: 'Old B', description: '', tags: [], coverPath: '/cover-b.png', coverSource: 'embedded', sidecarFileName: null }
    ]

    const editedLeader: ApproveItemRequest = {
      mockupId: 1,
      title: 'Leader Title',
      description: 'Leader Desc',
      tagIds: [],
      coverPath: '/cover-leader.png',
      coverSource: 'embedded',
      isLeader: true,
      wasEdited: true,
      leaderId: null
    }

    const service = new ApprovalService(repo, mockProvider)
    const result = await service.reinferGroupRemainder(items, editedLeader)

    expect(result).toHaveLength(2)
    expect(result[0]!.title).toMatch(/^AI: /)
    expect(result[1]!.title).toMatch(/^AI: /)
  })

  it('returns items unchanged when provider is null', async () => {
    const m1 = repo.createMockup(makeMockup('b7', { title: 'M1', libraryPath: '/lib/b7/m1.psd' }))

    const items: ApprovalItem[] = [
      { mockupId: m1.id, leaderId: 99, isLeader: false, variantIndex: 1, title: 'Unchanged', description: '', tags: [], coverPath: '/c.png', coverSource: 'embedded', sidecarFileName: null }
    ]

    const editedLeader: ApproveItemRequest = {
      mockupId: 99,
      title: 'Leader',
      description: '',
      tagIds: [],
      coverPath: '/cover.png',
      coverSource: 'embedded',
      isLeader: true,
      wasEdited: false,
      leaderId: null
    }

    const service = new ApprovalService(repo, null)
    const result = await service.reinferGroupRemainder(items, editedLeader)

    expect(result).toHaveLength(1)
    expect(result[0]!.title).toBe('Unchanged')
  })
})

describe('ApprovalService — AI tags wired through TagService', () => {
  it('initQueue: AI-returned tags are snapped and resolved into ApprovalTags', async () => {
    const tagProvider: InferenceProvider = {
      id: 'tag-provider',
      name: 'TagProvider',
      async analyze(): Promise<InferenceResult> {
        return { title: 'AI Title', description: 'AI desc', tags: [{ category: 'Device', label: 'MacBook' }] }
      }
    }

    repo.createMockup(makeMockup('bt1', { title: 'T1', libraryPath: '/lib/bt1/t1.psd' }))
    const service = new ApprovalService(repo, tagProvider, new TagService(repo))
    const queue = await service.initQueue('bt1')

    expect(queue.items).toHaveLength(1)
    const item = queue.items[0]!
    expect(item.tags).toHaveLength(1)
    expect(item.tags[0]!.label).toBe('MacBook')
    expect(item.tags[0]!.categoryLabel).toBe('Device')
  })

  it('null-provider path still yields tags: []', async () => {
    repo.createMockup(makeMockup('bt2', { title: 'T2', libraryPath: '/lib/bt2/t2.psd' }))
    const service = new ApprovalService(repo, null, new TagService(repo))
    const queue = await service.initQueue('bt2')
    expect(queue.items[0]!.tags).toEqual([])
  })

  it('reinferGroupRemainder: re-inferred members carry resolved tags and leader tagIds → originalTags', async () => {
    let capturedInput: AnalysisInput | null = null
    const tagProvider: InferenceProvider = {
      id: 'tp2',
      name: 'TP2',
      async analyze(input: AnalysisInput): Promise<InferenceResult> {
        capturedInput = input
        return { title: 'Retagged', description: '', tags: [{ category: 'Device', label: 'iPhone' }] }
      }
    }

    const svc = new TagService(repo)
    const leader = repo.createMockup(makeMockup('bt3', { title: 'Leader', libraryPath: '/lib/bt3/l.psd', isGroup: true, importContext: { batchId: 'bt3', folderTrail: [], originalFilename: 'l.psd' } }))
    const member = repo.createMockup(makeMockup('bt3', { title: 'Member', libraryPath: '/lib/bt3/m.psd', groupId: leader.id, importContext: { batchId: 'bt3', folderTrail: [], originalFilename: 'm.psd' } }))

    // Snap a tag for the leader so tagIds is non-empty
    const [laptopTagId] = await svc.snapTags([{ category: 'Device', label: 'laptop' }])

    const memberItem: ApprovalItem = {
      mockupId: member.id,
      leaderId: leader.id,
      isLeader: false,
      variantIndex: 1,
      title: 'Old',
      description: '',
      tags: [],
      coverPath: '/c/m.png',
      coverSource: 'embedded',
      sidecarFileName: null
    }

    const editedLeader: ApproveItemRequest = {
      mockupId: leader.id,
      title: 'MacBook Pro',
      description: '',
      tagIds: [laptopTagId!],
      coverPath: '/c/l.png',
      coverSource: 'embedded',
      isLeader: true,
      wasEdited: true,
      leaderId: null
    }

    const service = new ApprovalService(repo, tagProvider, svc)
    const result = await service.reinferGroupRemainder([memberItem], editedLeader)

    expect(result).toHaveLength(1)
    expect(result[0]!.tags).toHaveLength(1)
    expect(result[0]!.tags[0]!.label).toBe('iPhone')
    expect(capturedInput).not.toBeNull()
    expect(capturedInput!.groupContext?.originalTags).toEqual([{ category: 'Device', label: 'laptop' }])
  })
})
