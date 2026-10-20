import { useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from './stores/libraryStore'
import MockupGrid from './MockupGrid'

export default function LibraryView({ starredOnly = false }: { starredOnly?: boolean }) {
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const query = useLibraryStore((s) => s.query)
  const sort = useLibraryStore((s) => s.sort)
  const setLoading = useLibraryStore((s) => s.setLoading)
  const setItems = useLibraryStore((s) => s.setItems)
  const setStats = useLibraryStore((s) => s.setStats)
  const items = useLibraryStore((s) => s.items)
  const isLoading = useLibraryStore((s) => s.isLoading)

  const fetchList = useCallback(async () => {
    setLoading(true)
    const [listRes, statsRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
        tagIds: tagFilter.length ? tagFilter : undefined,
        query: query || undefined,
        sort
      }),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    ])
    setLoading(false)
    if (listRes.success) setItems(listRes.data.items)
    if (statsRes.success) setStats(statsRes.data)
  }, [tagFilter, query, sort, setLoading, setItems, setStats])

  // Debounce all re-fetches at 250ms; covers search-as-you-type and filter/sort changes.
  useEffect(() => {
    const id = setTimeout(fetchList, 250)
    return () => clearTimeout(id)
  }, [fetchList])

  return (
    <div className="flex-1 overflow-auto">
      <MockupGrid
        items={starredOnly ? items.filter((item) => item.favourite) : items}
        isLoading={isLoading}
        onRefresh={() => void fetchList()}
      />
    </div>
  )
}
