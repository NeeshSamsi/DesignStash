import { useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { pilesIn, type PileIntent } from '@renderer/lib/library-list'
import { mockups } from '@renderer/lib/plural'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { toast, undoToast } from '@renderer/stores/toastStore'

export interface LibraryPilesInput {
  refresh: () => Promise<void>
}


const COPY = {
  create: 'Pile made',
  add: 'Added to the pile',
  merge: 'Piles merged'
} as const

/**
 * Pile actions for My Stash: make, add, merge and disband. Each is instant and offers Undo, which
 * undoes its entry in the app's history.
 */
export function useLibraryPiles({ refresh }: LibraryPilesInput) {
  const fail = () => toast({ variant: 'error', message: 'Couldn’t change that pile. Try again.' })

  /** A drop or ⌘G. Resolves once the grid has reloaded. */
  const run = useCallback(
    async (intent: PileIntent) => {
      const res =
        intent.kind === 'create'
          ? await window.api.invoke(IPC_CHANNELS.PILE_CREATE, {
              memberIds: intent.memberIds,
              topId: intent.topId
            })
          : intent.kind === 'add'
            ? await window.api.invoke(IPC_CHANNELS.PILE_ADD, {
                pileId: intent.pileId,
                memberIds: intent.memberIds
              })
            : await window.api.invoke(IPC_CHANNELS.PILE_MERGE, {
                sourceIds: intent.sourceIds,
                targetId: intent.targetId
              })
      if (!res.success) return fail()
      const { pileId, undoEntryId } = res.data
      const count =
        intent.kind === 'create'
          ? intent.memberIds.length
          : intent.kind === 'add'
            ? intent.memberIds.length
            : intent.sourceIds.length + 1
      useDetailEffects.getState().selectAfterReload([pileId])
      await refresh()
      undoToast(COPY[intent.kind], undoEntryId, mockups(count))
    },
    [refresh]
  )

  /** ⇧⌘G or the menu. The variants land as separate cards, all selected, so ⌘G piles them again. */
  const disband = useCallback(
    async (targets: readonly LibraryItem[]) => {
      const piles = pilesIn(targets)
      if (piles.length === 0) return
      // One call for every pile: one change, one undo entry.
      const res = await window.api.invoke(IPC_CHANNELS.PILE_DISBAND, {
        pileIds: piles.map((pile) => pile.id)
      })
      if (!res.success) return fail()
      const { freedIds: freed, undoEntryId } = res.data
      useDetailEffects.getState().selectAfterReload(freed)
      await refresh()
      undoToast(
        piles.length === 1 ? 'Pile disbanded' : 'Piles disbanded',
        undoEntryId,
        `${mockups(freed.length)} ${freed.length === 1 ? 'is' : 'are'} on ${freed.length === 1 ? 'its' : 'their'} own`
      )
    },
    [refresh]
  )

  return { run, disband }
}
