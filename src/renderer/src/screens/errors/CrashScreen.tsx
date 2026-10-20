import { useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { CenteredLayout } from '@renderer/components/CenteredLayout'
import { ErrorState } from '@renderer/components/ErrorState'
import { toast } from '@renderer/stores/toastStore'
import { Toaster } from '@renderer/ui/sonner'

/**
 * X1 · the app crashed: a full-window ErrorState with Reload, Quit and Copy report.
 * Nothing technical is on screen: no codes, no stack trace. Copy report puts a scrubbed
 * diagnostic on the clipboard instead. Figma: ↳ Errors › X1.
 */
export function CrashScreen() {
  const reload = useCallback(() => {
    void window.api.invoke(IPC_CHANNELS.APP_RELOAD, undefined).catch(() => window.location.reload())
  }, [])
  const quit = useCallback(() => void window.api.invoke(IPC_CHANNELS.APP_QUIT, undefined), [])
  const copyReport = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.REPORT_COPY, undefined).catch(() => null)
    toast(
      res?.success && res.data.copied
        ? { variant: 'success', message: 'Report copied' }
        : { variant: 'error', message: 'Couldn’t copy the report. Try again.' }
    )
  }, [])

  return (
    <>
      <CenteredLayout
        variant="bare"
        content={
          <ErrorState
            variant="full-window"
            title="Something went wrong"
            message="DesignStash hit a problem it couldn’t recover from. Your stash is safe. Reload to carry on."
            retryLabel="Reload"
            onRetry={reload}
            secondaryLabel="Quit"
            onSecondary={quit}
            showDetails
            onCopyReport={() => void copyReport()}
          />
        }
      />
      <Toaster />
    </>
  )
}
