import { IPC_CHANNELS } from '@shared/ipc'
import { toast } from '@renderer/stores/toastStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { stashCheckCopy } from '../integrity'

/** “Check library” from a missing cover: runs the stash check and says what it found. */
export async function checkLibrary(): Promise<void> {
  const res = await window.api.invoke(IPC_CHANNELS.STASH_CHECK_RUN, undefined)
  const result = res.success ? res.data.lastRun?.result : undefined
  if (result === 'review') useUiStore.getState().openModal({ kind: 'reconcile' })
  else if (result === 'in-sync') toast({ variant: 'success', message: stashCheckCopy.inSync })
  else toast({ variant: 'error', message: stashCheckCopy.couldNotLoad })
}
