import { IPC_CHANNELS } from '@shared/ipc'
import type { NameChange } from '@shared/ipc/tags'
import { NameTakenError } from '../db/repositories/tags'
import { TagService } from '../db/tag-service'
import type { StateScope } from '../undo/ops'
import { undoEntry } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

/** Runs a rename or move; a name that's taken comes back as a refusal Settings can word. */
function nameChange(run: () => void): NameChange {
  try {
    run()
    return { ok: true }
  } catch (error) {
    if (error instanceof NameTakenError) return { ok: false, reason: 'taken', ...error.taken }
    throw error
  }
}

export function registerTagHandlers(ctx: HandlerContext): void {
  const { repo } = ctx
  const tagService = new TagService(repo)
  /** A rename, recorded only when it happened (a taken name changes nothing). */
  const renamed = async (label: string, scope: StateScope, run: () => void) => {
    const { result, record } = await ctx.dataOps.track(label, scope, () => nameChange(run))
    return result.ok ? { ...result, ...undoEntry(ctx.undo.record(record)) } : result
  }

  registerIpcHandler(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, () => {
    // AI suggestions aren't tags yet (F-034).
    const allCategories = repo.tags.getAllCategories().filter((c) => !c.suggestion)
    const allTags = repo.tags.getAllTags().filter((t) => t.createdBy !== 'suggestion')
    const categories = allCategories.map((cat) => ({
      categoryId: cat.id,
      categoryLabel: cat.label,
      tags: allTags
        .filter((t) => t.categoryId === cat.id)
        .map((t) => ({ tagId: t.id, label: t.label }))
    }))
    return { categories }
  })

  // A name the category already has, whatever its casing, answers with that tag (as AI tags snap to
  // it). A person adding one the AI only suggested makes it theirs, and its category too (F-034).
  registerIpcHandler(IPC_CHANNELS.TAG_CREATE, (args) => {
    const tag = repo.tags.claimTag(
      repo.tags.getTagByNormalisedLabel(args.categoryId, args.label) ??
        repo.tags.createTag({ label: args.label, categoryId: args.categoryId, createdBy: 'user' })
    )
    return { tagId: tag.id, label: tag.label, categoryId: tag.categoryId }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_TREE, () => ({ tree: repo.tags.getTagTree() }))

  registerIpcHandler(IPC_CHANNELS.TAG_RENAME, (args) =>
    renamed('Rename tag', { tagIds: [args.tagId] }, () =>
      repo.tags.renameTag(args.tagId, args.label)
    )
  )

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE, (args) =>
    repo.tags.mergeTags(args.sourceTagId, args.targetTagId)
  )

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE_PREVIEW, tagService.previewMergeTags)

  // Its undo puts the tag back on every mockup that carried it.
  registerIpcHandler(IPC_CHANNELS.TAG_DELETE, async (args) => {
    const { result, record } = await ctx.dataOps.track(
      'Delete tag',
      { tagIds: [args.tagId], mockupIds: ctx.dataOps.scopes.taggedWith([args.tagId]) },
      () => tagService.deleteTag(args)
    )
    return { ...result, ...undoEntry(ctx.undo.record(record)) }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_SET_CATEGORY, (args) =>
    nameChange(() => repo.tags.reassignTagCategory(args.tagId, args.categoryId))
  )

  registerIpcHandler(IPC_CHANNELS.CATEGORY_CREATE, (args) => {
    const found = repo.tags.getCategoryByNormalisedLabel(args.label)
    if (found) repo.tags.claimCategory(found.id)
    const cat = found ?? repo.tags.createCategory({ label: args.label })
    return { categoryId: cat.id, label: cat.label }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RENAME, (args) =>
    renamed('Rename category', { categoryIds: [args.categoryId] }, () =>
      repo.tags.renameCategory(args.categoryId, args.label)
    )
  )

  // Its undo puts the category back, with the tags it moved.
  registerIpcHandler(IPC_CHANNELS.CATEGORY_DELETE, async (args) => {
    const { scopes } = ctx.dataOps
    const tagIds = scopes.tagsIn(args.categoryId)
    const { result, record } = await ctx.dataOps.track(
      'Delete category',
      {
        categoryIds: [args.categoryId, ...(args.moveTagsTo === undefined ? [] : [args.moveTagsTo])],
        tagIds,
        mockupIds: scopes.taggedWith(tagIds)
      },
      () => tagService.deleteCategory(args)
    )
    return { ...result, ...undoEntry(ctx.undo.record(record)) }
  })
}
