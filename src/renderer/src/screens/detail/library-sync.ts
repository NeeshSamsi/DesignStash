import { IPC_CHANNELS } from '@shared/ipc'
import { useDetailEffects } from '../../stores/detailEffectsStore'
import { useLibraryStore } from '../../stores/libraryStore'

/**
 * Tell the library that Detail changed something it shows. Pages that read `useDetailEffects`
 * reload from the revision; the shared library store is refreshed here for the views that still
 * read it. A failed refresh is not Detail's problem, so it stays quiet.
 */
export async function syncLibrary(): Promise<void> {
  useDetailEffects.getState().notifyChanged()
  const { query, sort, tagFilter, setItems, setStats } = useLibraryStore.getState()
  try {
    const [list, stats] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
        ...(tagFilter.length > 0 ? { tagIds: tagFilter } : {}),
        ...(query ? { query } : {}),
        sort
      }),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    ])
    if (list.success) setItems(list.data.items)
    if (stats.success) setStats(stats.data)
  } catch {
    // The grid reloads itself next time it is shown.
  }
}
