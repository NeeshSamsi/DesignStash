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

  const load = useCallback(async (): Promise<Omit<PileItems, 'reload'>> => {
    try {
      const detail = await window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: pileId })
      if (!detail.success) return { status: 'error', gone: false, items: [], topId: null }
      if (detail.data.variants.length === 0)
        return { status: 'ready', gone: true, items: [], topId: null }
      const ordered = [...detail.data.variants].sort((a, b) => Number(b.isTop) - Number(a.isTop))
      const loaded = await Promise.all(
        ordered.map((variant) =>
          variant.id === pileId
            ? Promise.resolve(detail)
            : window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: variant.id })
        )
      )
      const items = loaded.flatMap((res) => (res.success ? [res.data.item] : []))
      return {
        status: 'ready',
        gone: false,
        items,
        topId: ordered.find((v) => v.isTop)?.id ?? pileId
      }
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
