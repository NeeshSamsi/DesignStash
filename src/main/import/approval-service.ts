import { basename } from 'node:path'
import type { Repository } from '../db/repository'
import type { Mockup } from '../db/schema'
import { InferenceResultSchema, type InferenceProvider } from '../../shared/inference'
import type {
  ApprovalItem,
  ApprovalQueue,
  ApprovalTag,
  ApproveItemRequest
} from '../../shared/approval'
import { TagService } from '../db/tag-service'
import { analysisInputFor } from '../ai/inference-service'

function toCoverSource(dbSource: string | null): ApprovalItem['coverSource'] {
  if (dbSource === 'embedded' || dbSource === 'sidecar' || dbSource === 'user-uploaded') {
    return dbSource
  }
  return 'none'
}

export class ApprovalService {
  private readonly tagService: TagService
  constructor(
    private readonly repo: Repository,
    private readonly provider: InferenceProvider | null,
    tagService?: TagService
  ) {
    this.tagService = tagService ?? new TagService(repo)
  }

  async initQueue(batchId: string): Promise<ApprovalQueue> {
    const all = this.repo.getMockupsByBatchId(batchId)

    const leaders = all.filter((m) => m.isGroup === true)
    const members = all.filter((m) => m.groupId !== null)
    const singletons = all.filter((m) => !m.isGroup && m.groupId === null)

    const leaderIds = new Set(leaders.map((l) => l.id))

    const items: ApprovalItem[] = []

    for (const leader of leaders) {
      const groupMembers = members
        .filter((m) => m.groupId === leader.id)
        .sort((a, b) => a.id - b.id)

      const leaderInferred = await this.runInference(leader)
      items.push({
        mockupId: leader.id,
        leaderId: null,
        isLeader: groupMembers.length > 0,
        variantIndex: 0,
        title: leaderInferred.title,
        description: leaderInferred.description,
        tags: leaderInferred.tags,
        coverPath: leader.coverPath,
        coverSource: toCoverSource(leader.coverSource),
        sidecarFileName: leader.coverSource === 'sidecar' ? basename(leader.coverPath) : null
      })

      let variantIndex = 1
      for (const member of groupMembers) {
        const memberInferred = await this.runInference(member)
        items.push({
          mockupId: member.id,
          leaderId: leader.id,
          isLeader: false,
          variantIndex: variantIndex++,
          title: memberInferred.title,
          description: memberInferred.description,
          tags: memberInferred.tags,
          coverPath: member.coverPath,
          coverSource: toCoverSource(member.coverSource),
          sidecarFileName: member.coverSource === 'sidecar' ? basename(member.coverPath) : null
        })
      }
    }

    // Singletons: mockups not captured as leader or member
    const capturedIds = new Set([...leaderIds, ...members.map((m) => m.id)])
    const trueSingletons = singletons.filter((m) => !capturedIds.has(m.id))

    for (const singleton of trueSingletons) {
      const inferred = await this.runInference(singleton)
      items.push({
        mockupId: singleton.id,
        leaderId: null,
        isLeader: false,
        variantIndex: 0,
        title: inferred.title,
        description: inferred.description,
        tags: inferred.tags,
        coverPath: singleton.coverPath,
        coverSource: toCoverSource(singleton.coverSource),
        sidecarFileName: singleton.coverSource === 'sidecar' ? basename(singleton.coverPath) : null
      })
    }

    return { batchId, items }
  }

  private async runInference(m: Mockup): Promise<{ title: string; description: string; tags: ApprovalTag[] }> {
    const input = analysisInputFor(m)
    const fileName = input.fileName

    // The background queue may have made the suggestion already.
    const cached = m.aiStatus === 'ready' ? InferenceResultSchema.safeParse(m.aiResult) : null
    if (cached?.success) return this.toApprovalFields(cached.data)

    if (this.provider) {
      try {
        return await this.toApprovalFields(await this.provider.analyze(input))
      } catch {
        // fall through to filename fallback
      }
    }

    const stem = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()
    return { title: stem || m.title, description: '', tags: [] }
  }

  private async toApprovalFields(result: {
    title: string
    description?: string
    tags: { category: string; label: string }[]
  }): Promise<{ title: string; description: string; tags: ApprovalTag[] }> {
    const tagIds = await this.tagService.snapTags(result.tags)
    return {
      title: result.title,
      description: result.description ?? '',
      tags: this.repo.getApprovalTagsByIds(tagIds)
    }
  }

  async initQueue_membersOnly(mocks: Mockup[]): Promise<ApprovalItem[]> {
    return Promise.all(
      mocks.map(async (m, i) => {
        const inferred = await this.runInference(m)
        return {
          mockupId: m.id,
          leaderId: m.groupId ?? null,
          isLeader: false,
          variantIndex: i + 1,
          title: inferred.title,
          description: inferred.description,
          tags: inferred.tags,
          coverPath: m.coverPath,
          coverSource: toCoverSource(m.coverSource),
          sidecarFileName: m.coverSource === 'sidecar' ? basename(m.coverPath) : null
        }
      })
    )
  }

  async reinferGroupRemainder(
    items: ApprovalItem[],
    editedLeader: ApproveItemRequest
  ): Promise<ApprovalItem[]> {
    if (!this.provider || items.length === 0) return items
    const originalTags = this.repo
      .getApprovalTagsByIds(editedLeader.tagIds)
      .map((t) => ({ category: t.categoryLabel, label: t.label }))
    return Promise.all(
      items.map(async (item) => {
        const m = this.repo.getMockup(item.mockupId)
        if (!m) return item
        const ctx = m.importContext as { originalFilename?: string; folderTrail?: string[] } | null
        try {
          const result = await this.provider!.analyze({
            imagePath: m.coverPath,
            fileName: ctx?.originalFilename ?? m.title,
            folderTrail: ctx?.folderTrail ?? [],
            groupContext: {
              originalTitle: editedLeader.title,
              originalDescription: editedLeader.description,
              originalTags
            }
          })
          const tagIds = await this.tagService.snapTags(result.tags)
          const tags = this.repo.getApprovalTagsByIds(tagIds)
          return { ...item, title: result.title, description: result.description ?? '', tags }
        } catch {
          return item
        }
      })
    )
  }
}
