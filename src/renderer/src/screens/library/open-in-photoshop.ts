import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { toast } from '@renderer/stores/toastStore'

/** Opens a mockup's PSD in Photoshop. Every way it can fail ends in a toast in plain words. */
export async function openInPhotoshop(item: Pick<LibraryItem, 'id'>): Promise<void> {
  const res = await window.api
    .invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: item.id })
    .catch(() => null)
  if (res?.success && res.data.opened) return
  toast({
    variant: 'error',
    message:
      res?.success && !res.data.opened && res.data.reason === 'no-app'
        ? 'Photoshop isn’t installed on this Mac.'
        : 'Couldn’t open this in Photoshop. Try again.'
  })
}
