import { IPC_CHANNELS } from '@shared/ipc'
import { TagService } from '../db/tag-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

/** A name without the spaces around it. One of only spaces is refused. */
function nameOf(label: string, what: 'tag' | 'category'): string {
  const name = label.trim()
  if (!name) throw new Error(`A ${what} needs a name`)
  return name
}

export function registerTagHandlers({ repo }: HandlerContext): void {
  const tagService = new TagService(repo)

  registerIpcHandler(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, () => {
    const allCategories = repo.tags.getAllCategories()
    const allTags = repo.tags.getAllTags()
    const categories = allCategories.map((cat) => ({
      categoryId: cat.id,
      categoryLabel: cat.label,
      tags: allTags
        .filter((t) => t.categoryId === cat.id)
        .map((t) => ({ tagId: t.id, label: t.label }))
    }))
    return { categories }
  })

  // A name the category already has, whatever its casing, answers with that tag (as AI tags snap to it).
  registerIpcHandler(IPC_CHANNELS.TAG_CREATE, (args) => {
    const label = nameOf(args.label, 'tag')
    const tag =
      repo.tags.getTagByNormalisedLabel(args.categoryId, label) ??
      repo.tags.createTag({ label, categoryId: args.categoryId })
    return { tagId: tag.id, label: tag.label, categoryId: tag.categoryId }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_TREE, () => ({ tree: repo.tags.getTagTree() }))

  registerIpcHandler(IPC_CHANNELS.TAG_RENAME, (args) => {
    repo.tags.renameTag(args.tagId, nameOf(args.label, 'tag'))
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE, (args) =>
    repo.tags.mergeTags(args.sourceTagId, args.targetTagId)
  )

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE_PREVIEW, tagService.previewMergeTags)

  registerIpcHandler(IPC_CHANNELS.TAG_DELETE, tagService.deleteTag)

  registerIpcHandler(IPC_CHANNELS.TAG_RESTORE, tagService.restoreTag)


  registerIpcHandler(IPC_CHANNELS.TAG_SET_CATEGORY, (args) => {
    repo.tags.reassignTagCategory(args.tagId, args.categoryId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_CREATE, (args) => {
    const label = nameOf(args.label, 'category')
    const cat =
      repo.tags.getCategoryByNormalisedLabel(label) ?? repo.tags.createCategory({ label })
    return { categoryId: cat.id, label: cat.label }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RENAME, (args) => {
    repo.tags.renameCategory(args.categoryId, nameOf(args.label, 'category'))
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_DELETE, tagService.deleteCategory)

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RESTORE, tagService.restoreCategory)
}
