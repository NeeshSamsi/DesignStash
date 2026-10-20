import { IPC_CHANNELS } from '@shared/ipc'
import { TagService } from '../db/tag-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerTagHandlers({ repo }: HandlerContext): void {
  const tagService = new TagService(repo)

  registerIpcHandler(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, () => {
    const allCategories = repo.getAllCategories()
    const allTags = repo.getAllTags()
    const categories = allCategories.map((cat) => ({
      categoryId: cat.id,
      categoryLabel: cat.label,
      tags: allTags
        .filter((t) => t.categoryId === cat.id)
        .map((t) => ({ tagId: t.id, label: t.label }))
    }))
    return { categories }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_CREATE, (args) => {
    const tag = repo.createTag({ label: args.label, categoryId: args.categoryId })
    return { tagId: tag.id, label: tag.label, categoryId: tag.categoryId }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_TREE, () => ({ tree: repo.getTagTree() }))

  registerIpcHandler(IPC_CHANNELS.TAG_RENAME, (args) => {
    repo.renameTag(args.tagId, args.label)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE, (args) =>
    repo.mergeTags(args.sourceTagId, args.targetTagId)
  )

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE_PREVIEW, tagService.previewMergeTags)

  registerIpcHandler(IPC_CHANNELS.TAG_DELETE, tagService.deleteTag)

  registerIpcHandler(IPC_CHANNELS.TAG_RESTORE, tagService.restoreTag)


  registerIpcHandler(IPC_CHANNELS.TAG_SET_CATEGORY, (args) => {
    repo.reassignTagCategory(args.tagId, args.categoryId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_CREATE, (args) => {
    const cat = repo.createCategory({ label: args.label })
    return { categoryId: cat.id, label: cat.label }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RENAME, (args) => {
    repo.renameCategory(args.categoryId, args.label)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_DELETE, tagService.deleteCategory)

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RESTORE, tagService.restoreCategory)
}
