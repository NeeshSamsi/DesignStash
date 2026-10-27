import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { useDetailEffects } from '../../stores/detailEffectsStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { syncLibrary } from './library-sync'

const stats = { total: 9, favourites: 2, groups: 1, trashed: 0 }
let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
  invoke = vi.fn(async (channel: string) =>
    channel === IPC_CHANNELS.LIBRARY_STATS
      ? { success: true, data: stats }
      : { success: true, data: { items: [] } }
  )
  window.api = { invoke } as unknown as typeof window.api
})

describe('syncLibrary', () => {
  it('tells the page to reload and refreshes the counts', async () => {
    const before = useDetailEffects.getState().revision
    await syncLibrary()
    expect(useDetailEffects.getState().revision).toBe(before + 1)
    expect(useLibraryStore.getState().stats).toEqual(stats)
  })

  it('fetches no list itself: the page reloads its own, with its view and filters', async () => {
    await syncLibrary()
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([IPC_CHANNELS.LIBRARY_STATS])
  })
})
