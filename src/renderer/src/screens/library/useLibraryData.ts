import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import type { TagTree } from '@shared/tags'
import { mergeLingering } from '@renderer/lib/library-list'
import type { FilterCategory } from '@renderer/lib/tag-filter'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useTagTreeStore } from '@renderer/stores/tagTreeStore'

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
 * How long to wait before asking once more for a search whose meaning hits were skipped because
 * the meaning model was still starting (H-3): it takes about half a second to start, and the
 * skipped answer keeps it starting meanwhile.
 */
export const MEANING_RETRY_MS = 700

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
  const lingering = useRef(new Set<number>())
  const [reloadKey, setReloadKey] = useState(0)
  // The list a second ask has gone out for, so a search is asked again at most once (H-3).
  const askedAgain = useRef<string | null>(null)

  // Landing on a view with a kept list puts it on screen before the first paint.
  useLayoutEffect(() => {
    const list = useLibraryStore.getState().cache[cacheKey]
    if (list !== undefined) setItems(list)
  }, [cacheKey, setItems])

  // A change of search, filter, sort or view (or `refresh`) fetches again; a stale answer is dropped.
  useEffect(() => {
    let current = true
    let askAgain: ReturnType<typeof setTimeout> | undefined
    const listArgs = {
      ...(tagIds.length > 0 ? { tagIds } : {}),
      ...(categoryIds.length > 0 ? { categoryIds } : {}),
      ...(query.trim() !== '' ? { query } : {}),
      ...(starredOnly ? { starredOnly } : {}),
      sort
    }
    const show = (items: LibraryItem[]) => {
      const previous = useLibraryStore.getState().items
      const merged = mergeLingering(previous, items, lingering.current)
      setItems(merged)
      useLibraryStore.getState().cacheList(cacheKey, merged)
    }
    void (async () => {
      try {
        const [listRes, statsRes] = await Promise.all([
          window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, listArgs),
          window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
        ])
        if (!current) return
        if (listRes.success) {
          show(listRes.data.items)
          setFailed(false)
          setFetched(true)
          // The meaning model was still starting: ask once more for this list, a moment later (H-3).
          if (listRes.data.meaningSkipped && askedAgain.current !== cacheKey) {
            askedAgain.current = cacheKey
            askAgain = setTimeout(() => {
              void window.api
                .invoke(IPC_CHANNELS.LIBRARY_LIST, listArgs)
                .then((again) => {
                  if (current && again.success) show(again.data.items)
                })
                .catch(() => {})
            }, MEANING_RETRY_MS)
          }
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
      clearTimeout(askAgain)
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

  // The filter lists whatever the tag store holds, so a rename in Settings shows here at once.
  const tagTree = useTagTreeStore((s) => s.tree)
  const tagCategories = useMemo(() => toFilterCategories(tagTree ?? []), [tagTree])
  useEffect(() => {
    void useTagTreeStore.getState().load()
  }, [])

  const keepLingering = useCallback((id: number) => void lingering.current.add(id), [])
  const releaseLingering = useCallback((id: number) => void lingering.current.delete(id), [])

  return { loaded, failed, refresh, keepLingering, releaseLingering, tagCategories }
}
