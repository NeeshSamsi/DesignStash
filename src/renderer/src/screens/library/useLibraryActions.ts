import { useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { openInPhotoshop } from './open-in-photoshop'
import { useLibraryStore } from '@renderer/stores/libraryStore'

/** The app's last action, for “Undo …” in the empty-space menu. */
export interface UndoEntry {
  /** Names the action: “Move to Trash”. The menu reads “Undo Move to Trash”. */
  name: string
  run: () => Promise<void>
}

export interface LibraryActionsInput {
  starredOnly: boolean
  refresh: () => Promise<void>
  keepLingering: (id: number) => void
  clearSelection: () => void
}

/** What the page does to mockups. Every reversible one is instant with an Undo toast. */
export function useLibraryActions({
  starredOnly,
  refresh,
  keepLingering,
  clearSelection
}: LibraryActionsInput) {
  /**
   * Stars or unstars these in one call, so it's one change and one undo entry. The cards change at
   * once and change back if main refuses. Gives the entry, or false when it failed.
   */
  const setFavourite = useCallback(async (ids: readonly number[], favourite: boolean) => {
    const patch = (value: boolean) => {
      const state = useLibraryStore.getState()
      state.setItems(state.items.map((i) => (ids.includes(i.id) ? { ...i, favourite: value } : i)))
    }
    patch(favourite)
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, {
      ids: [...ids],
      favourite
    })
    if (!res.success) {
      patch(!favourite)
      toast({ variant: 'error', message: 'Couldn’t update the star. Try again.' })
      return false as const
    }
    const stats = await window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    if (stats.success) useLibraryStore.getState().setStats(stats.data)
    return { undoEntryId: res.data.undoEntryId }
  }, [])

  /** Stars or unstars. In Starred an unstarred card stays until you leave, with Undo. */
  const setFavouriteFor = useCallback(
    async (targets: readonly LibraryItem[], favourite: boolean) => {
      const changed = targets.filter((item) => item.favourite !== favourite)
      if (changed.length === 0) return
      const ids = changed.map((item) => item.id)
      const done = await setFavourite(ids, favourite)
      if (!done || !(starredOnly && !favourite)) return
      for (const id of ids) keepLingering(id)
      undoToast('Removed from Starred', done.undoEntryId)
    },
    [starredOnly, setFavourite, keepLingering]
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
          : first && first.pile
            ? `${first.title} and ${first.pile.memberCount - 1} more in the pile`
            : (first?.title ?? '')
      undoToast('Moved to Trash', res.data.undoEntryId, description)
    },
    [clearSelection, refresh]
  )

  return {
    setFavouriteFor,
    trash,
    openInPhotoshop
  }
}
