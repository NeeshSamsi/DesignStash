import type { Repository } from '../db/repository'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import type { IPC_CHANNELS } from '@shared/ipc-channels'

type Channels = typeof IPC_CHANNELS
type Handler<C extends IpcChannel> = (args: IpcRequest<C>) => IpcResponse<C>

export class TagService {
  constructor(private readonly repo: Repository) {}

  /**
   * Snaps AI-generated tags to existing canonical tags or creates new ones if needed (spec §3.6).
   */
  async snapTags(aiTags: { category: string; label: string }[]): Promise<number[]> {
    const tagIds: number[] = []

    for (const aiTag of aiTags) {
      // 1. Find or create category
      let category = this.repo.getCategoryByLabel(aiTag.category)
      if (!category) {
        category = this.repo.createCategory({
          label: aiTag.category,
          isCanonical: false // AI-created categories are not canonical by default
        })
      }

      // 2. Find or create tag
      let tag = this.repo.getTagByLabel(category.id, aiTag.label)
      if (!tag) {
        tag = this.repo.createTag({
          label: aiTag.label,
          categoryId: category.id,
          isCanonical: false,
          createdBy: 'ai'
        })
      }

      tagIds.push(tag.id)
    }

    return Array.from(new Set(tagIds))
  }

  // TagTree operations. Each method is the IPC handler body for its channel.

  deleteTag: Handler<Channels['TAG_DELETE']> = ({ tagId }) => this.repo.deleteTag(tagId)

  restoreTag: Handler<Channels['TAG_RESTORE']> = ({ snapshot }) => this.repo.restoreTag(snapshot)

  previewMergeTags: Handler<Channels['TAG_MERGE_PREVIEW']> = ({ sourceTagId, targetTagId }) =>
    this.repo.previewMergeTags(sourceTagId, targetTagId)

  deleteCategory: Handler<Channels['CATEGORY_DELETE']> = ({ categoryId, moveTagsTo }) =>
    this.repo.deleteCategory(categoryId, moveTagsTo)

  restoreCategory: Handler<Channels['CATEGORY_RESTORE']> = ({ snapshot }) =>
    this.repo.restoreCategory(snapshot)
}
