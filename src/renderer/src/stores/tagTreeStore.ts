import { create } from 'zustand'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TagTree } from '@shared/tags'

interface TagTreeState {
  /** Every category with its tags and use counts. `null` until the first load answers. */
  tree: TagTree | null
  /** Fetches the tree again and returns what the store now holds. A failed fetch keeps the old tree. */
  load(): Promise<TagTree>
  /** Puts a tag just created in the main process into the tree, before the reload answers. */
  addTag(
    category: { categoryId: number; categoryLabel: string },
    tag: { tagId: number; label: string }
  ): void
  reset(): void
}

/** Only the newest answer is applied, so a slow earlier fetch cannot undo a later one. */
let latest = 0

/**
 * The one copy of the tag tree. The filter, the sidebar editor, look-over and Settings › Tags all
 * read it, and anything that changes a tag calls `load()` so they agree.
 */
export const useTagTreeStore = create<TagTreeState>((set, get) => ({
  tree: null,
  load: async () => {
    const request = ++latest
    try {
      const res = await window.api.invoke(IPC_CHANNELS.TAG_TREE, undefined)
      if (res.success && request === latest) set({ tree: res.data.tree })
    } catch {
      // Keep what is there; the next change reloads.
    }
    return get().tree ?? []
  },
  addTag: (category, tag) =>
    set((state) => {
      const tree = state.tree ?? []
      const entry = { tagId: tag.tagId, label: tag.label, usageCount: 0 }
      if (tree.some((c) => c.categoryId === category.categoryId)) {
        return {
          tree: tree.map((c) =>
            c.categoryId === category.categoryId
              ? { ...c, tagCount: c.tagCount + 1, tags: [...c.tags, entry] }
              : c
          )
        }
      }
      return { tree: [...tree, { ...category, tagCount: 1, tags: [entry] }] }
    }),
  reset: () => {
    latest++
    set({ tree: null })
  }
}))
