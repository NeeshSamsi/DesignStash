import { useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { toast } from '../stores/toastStore'

const SEEN_KEY = 'ds:update-notice'

/** The version the notice last spoke about. Browser storage is a convenience: failing it repeats a notice at worst. */
function lastAnnounced(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

function markAnnounced(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Nothing to do: the notice may show again next launch.
  }
}

/**
 * The app-wide update notice: one quiet toast per new version, on launch. The status read waits
 * for the main process's launch check, so a release found at launch shows up here. Download opens
 * the release page. Offline or failed checks say nothing here; Settings › About shows them.
 */
export function useUpdateNotice(): void {
  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.UPDATES_STATUS, undefined).catch(() => null)
      if (!res?.success || res.data.state !== 'available') return
      const { version } = res.data
      if (lastAnnounced() === version) return
      markAnnounced(version)
      toast({
        message: `DesignStash ${version} is out`,
        description: 'See what’s new in Settings › About.',
        action: {
          label: 'Download',
          onClick: () => void window.api.invoke(IPC_CHANNELS.UPDATES_INSTALL, undefined)
        }
      })
    })()
  }, [])
}
