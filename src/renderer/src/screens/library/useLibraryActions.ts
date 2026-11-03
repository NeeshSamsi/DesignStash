import { useCallback, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'

/** The last change that can still be undone, for “Undo …” in the empty-space menu. */
export interface UndoEntry {
  /** Names the change: “move to Trash”. The menu reads “Undo move to Trash”. */
  name: string
  run: () => Promise<void>
}

export interface LibraryActionsInput {
  starredOnly: boolean
  refresh: () => Promise<void>
  keepLingering: (id: number) => void
  releaseLingering: (id: number) => void
  clearSelection: () => void
}

/** What the page does to mockups. Every reversible one is instant with an Undo toast. */
export function useLibraryActions({
  starredOnly,
  refresh,
  keepLingering,
  releaseLingering,
  clearSelection
}: LibraryActionsInput) {
  const [lastUndo, setLastUndo] = useState<UndoEntry | null>(null)
  const latest = useRef<UndoEntry | null>(null)

  /**
   * Shows the Undo toast and remembers the change for the menu. Undo runs once, from whichever
   * of the two is used first.
   */
  const offerUndo = useCallback(
    (name: string, message: string, run: () => Promise<void>, description?: string) => {
      let used = false
      const entry: UndoEntry = {
        name,
        run: async () => {
          if (used) return
          used = true
          if (latest.current === entry) {
            latest.current = null
            setLastUndo(null)
          }
          await run()
        }
      }
      latest.current = entry
      setLastUndo(entry)
      undoToast(message, () => void entry.run(), description)
    },
    []
  )

  const undoLast = useCallback(async () => {
    await latest.current?.run()
  }, [])

  const setFavourite = useCallback(async (id: number, favourite: boolean) => {
    const patch = (value: boolean) => {
      const state = useLibraryStore.getState()
      state.setItems(state.items.map((i) => (i.id === id ? { ...i, favourite: value } : i)))
    }
    patch(favourite)
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, {
      mockupId: id,
      favourite
    })
    if (!res.success) {
      patch(!favourite)
      toast({ variant: 'error', message: 'Couldn’t update the star. Try again.' })
      return false
    }
    const stats = await window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    if (stats.success) useLibraryStore.getState().setStats(stats.data)
    return true
  }, [])

  /** Stars or unstars. In Starred an unstarred card stays until you leave, with Undo. */
  const setFavouriteFor = useCallback(
    async (targets: readonly LibraryItem[], favourite: boolean) => {
      const changed: LibraryItem[] = []
      for (const item of targets) {
        if (item.favourite === favourite) continue
        if (await setFavourite(item.id, favourite)) changed.push(item)
      }
      if (changed.length === 0 || !(starredOnly && !favourite)) return
      for (const item of changed) keepLingering(item.id)
      offerUndo('unstar', 'Removed from Starred', async () => {
        for (const item of changed) {
          releaseLingering(item.id)
          await setFavourite(item.id, true)
        }
      })
    },
    [starredOnly, setFavourite, keepLingering, releaseLingering, offerUndo]
  )

  const trash = useCallback(
    async (targets: readonly LibraryItem[]) => {
      if (targets.length === 0) return
      const ids = targets.map((item) => item.id)
      const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_TRASH, { ids })
      if (!res.success || !res.data.ok) {
        toast({ variant: 'error', message: 'Couldn’t move that to Trash. Try again.' })
        return
      }
      clearSelection()
      await refresh()
      const [first] = targets
      const description =
        targets.length > 1
          ? `${targets.length} mockups`
          : first && first.isGroup
            ? `${first.title} and ${first.variantCount} more in the pile`
            : (first?.title ?? '')
      offerUndo(
        'move to Trash',
        'Moved to Trash',
        async () => {
          await window.api.invoke(IPC_CHANNELS.MOCKUP_RESTORE, { ids })
          await refresh()
        },
        description
      )
    },
    [clearSelection, refresh, offerUndo]
  )

  const openInPhotoshop = useCallback(async (item: LibraryItem) => {
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: item.id })
    if (res.success && !res.data.opened) {
      toast({
        variant: 'error',
        message:
          res.data.reason === 'no-app'
            ? 'Photoshop isn’t installed on this Mac.'
            : 'Couldn’t open this in Photoshop. Try again.'
      })
    }
  }, [])

  return {
    lastUndo,
    undoLast,
    offerUndo,
    setFavouriteFor,
    trash,
    openInPhotoshop
  }
}
