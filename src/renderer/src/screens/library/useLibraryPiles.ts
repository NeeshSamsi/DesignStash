import { useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { PileSnapshot } from '@shared/ipc/pile'
import type { LibraryItem } from '@shared/library'
import { pilesIn, type PileIntent } from '@renderer/lib/library-list'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { toast } from '@renderer/stores/toastStore'

export interface LibraryPilesInput {
  refresh: () => Promise<void>
  offerUndo: (name: string, message: string, run: () => Promise<void>, description?: string) => void
}

const mockups = (n: number) => `${n} ${n === 1 ? 'mockup' : 'mockups'}`

const COPY = {
  create: { name: 'new pile', message: 'Pile made' },
  add: { name: 'add to pile', message: 'Added to the pile' },
  merge: { name: 'merge piles', message: 'Piles merged' }
} as const

/**
 * Pile actions for My Stash: make, add, merge and disband. Each is instant and offers Undo, which
 * puts every mockup back from the snapshot the main process returned.
 */
export function useLibraryPiles({ refresh, offerUndo }: LibraryPilesInput) {
  const restore = useCallback(
    async (snapshots: PileSnapshot[]) => {
      for (const snapshot of [...snapshots].reverse()) {
        await window.api.invoke(IPC_CHANNELS.PILE_RESTORE, { snapshot })
      }
      await refresh()
    },
    [refresh]
  )

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
      const { pileId, snapshot } = res.data
      const count =
        intent.kind === 'create'
          ? intent.memberIds.length
          : intent.kind === 'add'
            ? intent.memberIds.length
            : intent.sourceIds.length + 1
      useDetailEffects.getState().selectAfterReload([pileId])
      await refresh()
      offerUndo(
        COPY[intent.kind].name,
        COPY[intent.kind].message,
        () => restore([snapshot]),
        mockups(count)
      )
    },
    [refresh, offerUndo, restore]
  )

  /** ⇧⌘G or the menu. The variants land as separate cards, all selected, so ⌘G piles them again. */
  const disband = useCallback(
    async (targets: readonly LibraryItem[]) => {
      const piles = pilesIn(targets)
      if (piles.length === 0) return
      const snapshots: PileSnapshot[] = []
      const freed: number[] = []
      for (const pile of piles) {
        const res = await window.api.invoke(IPC_CHANNELS.PILE_DISBAND, { pileId: pile.id })
        if (!res.success) {
          fail()
          break
        }
        snapshots.push(res.data.snapshot)
        freed.push(...res.data.freedIds)
      }
      if (snapshots.length === 0) return
      useDetailEffects.getState().selectAfterReload(freed)
      await refresh()
      offerUndo(
        'disband pile',
        snapshots.length === 1 ? 'Pile disbanded' : 'Piles disbanded',
        () => restore(snapshots),
        `${mockups(freed.length)} ${freed.length === 1 ? 'is' : 'are'} on ${freed.length === 1 ? 'its' : 'their'} own`
      )
    },
    [refresh, offerUndo, restore]
  )

  return { run, disband }
}
