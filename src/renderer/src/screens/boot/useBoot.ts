import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'

export type BootState =
  | 'loading'
  | 'ok'
  | 'library-failed'
  | 'folder-unavailable'
  | 'settings-corrupt'

export interface Boot {
  state: BootState
  /** `settings-corrupt`: the unreadable file was kept as a copy. */
  backupKept: boolean
  /** Whether first-run onboarding is still to do. `null` until settings answer. */
  onboarded: boolean | null
  /** Leaves the problem screen (settings were reset, carry on). */
  dismiss: () => void
  markOnboarded: () => void
}

/**
 * What launch found, and whether onboarding is done. If asking fails the app carries on as normal:
 * a broken bridge is not a reason to lock the window.
 */
export function useBoot(): Boot {
  const [state, setState] = useState<BootState>('loading')
  const [backupKept, setBackupKept] = useState(false)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const [boot, settings] = await Promise.all([
          window.api.invoke(IPC_CHANNELS.BOOT_STATUS, undefined),
          window.api.invoke(IPC_CHANNELS.SETTINGS_GET, undefined)
        ])
        if (!live) return
        setOnboarded(settings.success ? settings.data.onboarded : true)
        setBackupKept(boot.success ? boot.data.backupKept : false)
        setState(boot.success ? (boot.data.state ?? 'ok') : 'ok')
      } catch {
        // A rejected invoke is a broken bridge, the same as a failed reply: carry on.
        if (!live) return
        setOnboarded(true)
        setState('ok')
      }
    })()
    return () => {
      live = false
    }
  }, [])

  return {
    state,
    backupKept,
    onboarded,
    dismiss: () => setState('ok'),
    markOnboarded: () => setOnboarded(true)
  }
}
