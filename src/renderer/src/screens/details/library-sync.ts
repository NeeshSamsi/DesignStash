import { IPC_CHANNELS } from '@shared/ipc'
import { useDetailEffects } from '../../stores/detailEffectsStore'
import { useLibraryStore } from '../../stores/libraryStore'

/**
 * Tell the library that Detail changed something it shows. The page reloads its list from the
 * revision, with its own view and filters; the counts are refreshed here. A failed refresh is not
 * Detail's problem, so it stays quiet.
 */
export async function syncLibrary(): Promise<void> {
  useDetailEffects.getState().notifyChanged()
  try {
    const stats = await window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    if (stats.success) useLibraryStore.getState().setStats(stats.data)
  } catch {
    // The counts catch up with the next change.
  }
}
