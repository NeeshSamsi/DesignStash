import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'

export interface PileItems {
  status: 'loading' | 'ready' | 'error'
  /** The pile no longer exists (its last mockups were removed or it was disbanded elsewhere). */
  gone: boolean
  /** The pile's mockups, the top one first, each with its own tags and star. */
  items: LibraryItem[]
  /** The id of the top mockup (the pile itself). */
  topId: number | null
  reload: () => Promise<void>
}

/** Loads one pile's mockups for the pile page, and again whenever the sidebar or a menu changes something. */
export function usePileItems(pileId: number): PileItems {
  const [state, setState] = useState<Omit<PileItems, 'reload'>>({
    status: 'loading',
    gone: false,
    items: [],
    topId: null
  })
  const revision = useDetailEffects((s) => s.revision)

  // One call for the whole pile, however many mockups it has (F-068).
  const load = useCallback(async (): Promise<Omit<PileItems, 'reload'>> => {
    try {
      const res = await window.api.invoke(IPC_CHANNELS.PILE_MEMBERS, { pileId })
      if (!res.success) return { status: 'error', gone: false, items: [], topId: null }
      const items = res.data.items
      if (items.length === 0) return { status: 'ready', gone: true, items: [], topId: null }
      return { status: 'ready', gone: false, items, topId: items[0]?.id ?? pileId }
    } catch {
      return { status: 'error', gone: false, items: [], topId: null }
    }
  }, [pileId])

  useEffect(() => {
    let live = true
    void load().then((next) => live && setState(next))
    return () => {
      live = false
    }
  }, [load, revision])

  const reload = useCallback(async () => setState(await load()), [load])
  return { ...state, reload }
}
