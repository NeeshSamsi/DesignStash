import { IPC_CHANNELS } from '@shared/ipc'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { syncLibrary } from './library-sync'

/**
 * Breaks a pile up into its mockups, instantly, with an Undo toast. The freed mockups are selected
 * once the grid has reloaded. True when it worked.
 */
export async function disbandPile(pileId: number): Promise<boolean> {
  const res = await window.api.invoke(IPC_CHANNELS.PILE_DISBAND, { pileId }).catch(() => null)
  if (!res?.success) {
    toast({
      variant: 'error',
      message: 'Couldn’t disband the pile',
      description: 'Nothing was changed. Try again.'
    })
    return false
  }
  const { snapshot, freedIds } = res.data
  useDetailEffects.getState().selectAfterReload(freedIds)
  void syncLibrary()
  undoToast(
    'Pile disbanded',
    () => {
      useDetailEffects.getState().selectAfterReload([])
      void window.api.invoke(IPC_CHANNELS.PILE_RESTORE, { snapshot }).then(() => syncLibrary())
    },
    `${freedIds.length} mockups are on their own`
  )
  return true
}

/**
 * Puts a mockup on top of its pile, with an Undo toast. Returns the pile's id after the change
 * (the top mockup is the pile), or null when it failed.
 */
export async function putOnTop(
  pileId: number,
  topId: number,
  label: string
): Promise<number | null> {
  const res = await window.api
    .invoke(IPC_CHANNELS.PILE_SET_TOP, { pileId, topId })
    .catch(() => null)
  if (!res?.success) {
    toast({
      variant: 'error',
      message: 'Couldn’t put it on top',
      description: 'Nothing was changed. Try again.'
    })
    return null
  }
  const { pileId: next, snapshot } = res.data
  void syncLibrary()
  undoToast(`${label} is on top`, () => {
    void window.api.invoke(IPC_CHANNELS.PILE_RESTORE, { snapshot }).then(() => syncLibrary())
  })
  return next
}

/**
 * Takes one mockup out of its pile, instantly, with an Undo toast. Removing the top promotes the next
 * mockup; a pile left with one mockup stops being a pile. Returns the pile's id afterwards (null when it
 * dissolved), or undefined when it failed.
 */
export async function removeFromPile(
  pileId: number,
  mockupId: number,
  label: string
): Promise<{ pileId: number | null } | undefined> {
  const res = await window.api
    .invoke(IPC_CHANNELS.PILE_REMOVE, { pileId, mockupId })
    .catch(() => null)
  if (!res?.success) {
    toast({
      variant: 'error',
      message: 'Couldn’t remove it from the pile',
      description: 'Nothing was changed. Try again.'
    })
    return undefined
  }
  const { pileId: next, snapshot } = res.data
  void syncLibrary()
  undoToast(
    'Removed from the pile',
    () => {
      void window.api.invoke(IPC_CHANNELS.PILE_RESTORE, { snapshot }).then(() => syncLibrary())
    },
    next === null ? `${label} and the other mockup are on their own` : `${label} is on its own`
  )
  return { pileId: next }
}
