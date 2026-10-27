import { useCallback, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { undoEntry } from '@renderer/lib/undo-router'
import { openInPhotoshop } from './open-in-photoshop'
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
   * of the two is used first. With the entry the change recorded in the app's history, both undo
   * that entry (undo:entry); without one, they run `run`.
   */
  const offerUndo = useCallback(
    (
      name: string,
      message: string,
      run: () => Promise<void>,
      description?: string,
      entryId?: number
    ) => {
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
          await (entryId === undefined ? run() : undoEntry(entryId))
        }
      }
      latest.current = entry
      setLastUndo(entry)
      undoToast(message, () => void entry.run(), description, entryId)
    },
    []
  )

  const undoLast = useCallback(async () => {
    await latest.current?.run()
  }, [])

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
      offerUndo(
        'unstar',
        'Removed from Starred',
        async () => {
          for (const id of ids) releaseLingering(id)
          await setFavourite(ids, true)
        },
        undefined,
        done.undoEntryId
      )
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
          : first && first.pile
            ? `${first.title} and ${first.pile.memberCount - 1} more in the pile`
            : (first?.title ?? '')
      offerUndo(
        'move to Trash',
        'Moved to Trash',
        async () => {
          await window.api.invoke(IPC_CHANNELS.MOCKUP_RESTORE, { ids })
          await refresh()
        },
        description,
        res.data.undoEntryId
      )
    },
    [clearSelection, refresh, offerUndo]
  )

  return {
    lastUndo,
    undoLast,
    offerUndo,
    setFavouriteFor,
    trash,
    openInPhotoshop
  }
}
