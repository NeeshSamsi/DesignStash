import type { Repository } from '../db/repository'
import type { InvokeChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import type { IPC_CHANNELS } from '@shared/ipc-channels'

type Channels = typeof IPC_CHANNELS
type Handler<C extends InvokeChannel> = (args: IpcRequest<C>) => IpcResponse<C>

export class TagService {
  constructor(private readonly repo: Repository) {}

  /**
   * Snaps AI-generated tags to existing canonical tags or creates new ones if needed (spec §3.6).
   */
  async snapTags(aiTags: { category: string; label: string }[]): Promise<number[]> {
    const tagIds: number[] = []

    for (const aiTag of aiTags) {
      // 1. Find or create category
      let category = this.repo.tags.getCategoryByNormalisedLabel(aiTag.category)
      if (!category) {
        // A suggestion until one of its tags lands on a mockup (F-034).
        category = this.repo.tags.createCategory({
          label: aiTag.category.trim(),
          isCanonical: false, // AI-created categories are not canonical by default
          suggestion: true
        })
      }

      // 2. Find or create tag
      // A suggestion snaps to the label already there ("iphone" finds "iPhone"). A new one keeps
      // the casing the model gave, trimmed.
      let tag = this.repo.tags.getTagByNormalisedLabel(category.id, aiTag.label)
      if (!tag) {
        tag = this.repo.tags.createTag({
          label: aiTag.label.trim().replace(/\s+/g, ' '),
          categoryId: category.id,
          isCanonical: false,
          // Not a tag yet: it turns 'ai' when it lands on a mockup (F-034).
          createdBy: 'suggestion'
        })
      }

      tagIds.push(tag.id)
    }

    return Array.from(new Set(tagIds))
  }

  // TagTree operations. Each method is the IPC handler body for its channel.

  deleteTag: Handler<Channels['TAG_DELETE']> = ({ tagId }) => this.repo.tags.deleteTag(tagId)

  previewMergeTags: Handler<Channels['TAG_MERGE_PREVIEW']> = ({ sourceTagId, targetTagId }) =>
    this.repo.tags.previewMergeTags(sourceTagId, targetTagId)

  deleteCategory: Handler<Channels['CATEGORY_DELETE']> = ({ categoryId, moveTagsTo }) =>
    this.repo.tags.deleteCategory(categoryId, moveTagsTo)
}
