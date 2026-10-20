import type { Repository } from '../db/repository'
import type { Mockup } from '../db/schema'
import type { TagService } from '../db/tag-service'
import type { InferenceProvider, AnalysisInput, InferenceResult } from '../../shared/inference'

type ImportContext = { folderTrail?: string[]; userEdited?: boolean } | null

/** What the provider is shown for a mockup: its cover, the file name it came in as, and the folders around it. */
export function analysisInputFor(m: Mockup): AnalysisInput {
  const ctx = m.importContext as { folderTrail?: string[]; originalFilename?: string } | null
  return {
    imagePath: m.coverPath,
    fileName: ctx?.originalFilename ?? m.title,
    folderTrail: ctx?.folderTrail ?? []
  }
}

export class InferenceService {
  constructor(
    private repo: Repository,
    private tagService: TagService,
    private provider: InferenceProvider
  ) {}

  /** Analyze one mockup's cover, snap tags, persist title/description + tag links.
   *  Stays review_status='needs_review' — M6 approval flips it. */
  async analyzeMockup(mockupId: number, input: AnalysisInput): Promise<InferenceResult> {
    const result = await this.provider.analyze(input)
    const tagIds = await this.tagService.snapTags(result.tags)

    this.repo.clearTagsForMockup(mockupId)
    for (const tagId of tagIds) {
      this.repo.addTagToMockup(mockupId, tagId)
    }

    this.repo.updateMockup(mockupId, { title: result.title, description: result.description })
    return result
  }

  /** §3.4 first-variant propagation: re-infer group siblings using variant-1's corrected
   *  fields as groupContext. Skips any mockup where importContext.userEdited === true. */
  async reinferGroup(
    groupId: number,
    groundTruth: { title: string; description: string; tags: { category: string; label: string }[] }
  ): Promise<void> {
    const siblings = this.repo.getMockupsByGroupId(groupId)
    for (const sibling of siblings) {
      const ctx = sibling.importContext as ImportContext
      if (ctx?.userEdited) continue

      const input: AnalysisInput = {
        imagePath: sibling.coverPath,
        fileName: sibling.title,
        folderTrail: ctx?.folderTrail ?? [],
        groupContext: {
          originalTitle: groundTruth.title,
          originalDescription: groundTruth.description,
          originalTags: groundTruth.tags
        }
      }

      await this.analyzeMockup(sibling.id, input)
    }
  }

  setProvider(p: InferenceProvider): void {
    this.provider = p
  }
}
