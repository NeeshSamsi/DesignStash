import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TagTree } from '@shared/tags'
import { mergeLingering } from '@renderer/lib/library-list'
import type { FilterCategory } from '@renderer/lib/tag-filter'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'

/** `loading` until the first answer; after that the page keeps showing the last list while it refetches. */
export interface LibraryData {
  loaded: boolean
  /** The last fetch failed. With items on screen the page keeps them and shows a Banner. */
  failed: boolean
  refresh: () => Promise<void>
  /** Keeps an unstarred card on screen in Starred until the view is left. */
  keepLingering: (id: number) => void
  releaseLingering: (id: number) => void
  /** Tags for the filter popover, with how many mockups carry each. */
  tagCategories: FilterCategory[]
}

function toFilterCategories(tree: TagTree): FilterCategory[] {
  return tree.map((category) => ({
    categoryId: category.categoryId,
    categoryLabel: category.categoryLabel,
    tags: category.tags.map((tag) => ({
      tagId: tag.tagId,
      label: tag.label,
      count: tag.usageCount
    }))
  }))
}

/** What a list depends on: the same key shows the same cards. */
const cacheKeyOf = (parts: object) => JSON.stringify(parts)

/**
 * Fetches My Stash for the current search, filter, sort and view, into the library store. A newer
 * request wins over an older one. Search arrives already debounced from the title-bar field.
 * The last list of each view is kept in the library store: coming back to a page shows it at once
 * and fetches again in the background, so the skeleton only shows on a first visit.
 */
export function useLibraryData(starredOnly: boolean): LibraryData {
  const tagIds = useLibraryStore((s) => s.tagFilter)
  const categoryIds = useLibraryStore((s) => s.categoryIds)
  const query = useLibraryStore((s) => s.query)
  const sort = useLibraryStore((s) => s.sort)
  const setItems = useLibraryStore((s) => s.setItems)
  const setStats = useLibraryStore((s) => s.setStats)
  // Detail bumps this when it saved, starred, trashed or changed a pile: fetch again.
  const detailRevision = useDetailEffects((s) => s.revision)

  const cacheKey = cacheKeyOf({ tagIds, categoryIds, query: query.trim(), sort, starredOnly })
  const [fetched, setFetched] = useState(false)
  // A view that has loaded before is ready at once, ahead of the fetch that revalidates it.
  const kept = useLibraryStore((s) => s.cache[cacheKey] !== undefined)
  const loaded = fetched || kept
  const [failed, setFailed] = useState(false)
  const [tagCategories, setTagCategories] = useState<FilterCategory[]>([])
  const lingering = useRef(new Set<number>())
  const [reloadKey, setReloadKey] = useState(0)

  // Landing on a view with a kept list puts it on screen before the first paint.
  useLayoutEffect(() => {
    const list = useLibraryStore.getState().cache[cacheKey]
    if (list !== undefined) setItems(list)
  }, [cacheKey, setItems])

  // A change of search, filter, sort or view (or `refresh`) fetches again; a stale answer is dropped.
  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const [listRes, statsRes] = await Promise.all([
          window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
            ...(tagIds.length > 0 ? { tagIds } : {}),
            ...(categoryIds.length > 0 ? { categoryIds } : {}),
            ...(query.trim() !== '' ? { query } : {}),
            ...(starredOnly ? { starredOnly } : {}),
            sort
          }),
          window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
        ])
        if (!current) return
        if (listRes.success) {
          const previous = useLibraryStore.getState().items
          const merged = mergeLingering(previous, listRes.data.items, lingering.current)
          setItems(merged)
          useLibraryStore.getState().cacheList(cacheKey, merged)
          setFailed(false)
          setFetched(true)
        } else {
          setFailed(true)
        }
        if (statsRes.success) setStats(statsRes.data)
      } catch {
        if (current) setFailed(true)
      }
    })()
    return () => {
      current = false
    }
  }, [
    cacheKey,
    tagIds,
    categoryIds,
    query,
    sort,
    starredOnly,
    reloadKey,
    detailRevision,
    setItems,
    setStats
  ])

  const refresh = useCallback(async () => setReloadKey((key) => key + 1), [])

  // Leaving Starred (or the page) lets go of cards that were only kept after being unstarred.
  useEffect(() => {
    const kept = lingering.current
    return () => kept.clear()
  }, [starredOnly])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.TAG_TREE, undefined)
      if (!cancelled && res.success) setTagCategories(toFilterCategories(res.data.tree))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const keepLingering = useCallback((id: number) => void lingering.current.add(id), [])
  const releaseLingering = useCallback((id: number) => void lingering.current.delete(id), [])

  return { loaded, failed, refresh, keepLingering, releaseLingering, tagCategories }
}
