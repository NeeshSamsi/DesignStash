import { useCallback, type ReactNode } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { CenteredLayout } from '@renderer/components/CenteredLayout'
import { ErrorState } from '@renderer/components/ErrorState'
import { LoadingState } from '@renderer/components/LoadingState'
import { OnboardingStep } from '@renderer/components/OnboardingStep'
import { Banner } from '@renderer/components/Banner'
import { toast } from '@renderer/stores/toastStore'
import { OnboardingFlow } from '../onboarding/OnboardingFlow'
import { useBoot } from './useBoot'

export interface BootGateProps {
  /** The app itself, once launch is fine and onboarding is done. */
  children: ReactNode
}

/**
 * Everything before the app window: the launch wait, launch problems, first-run onboarding.
 * Figma: ↳ Start › 0 · Launch, A · Onboarding.
 */
export function BootGate({ children }: BootGateProps) {
  const boot = useBoot()

  const relaunch = useCallback(
    () => void window.api.invoke(IPC_CHANNELS.APP_RELAUNCH, undefined),
    []
  )
  const copyReport = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.REPORT_COPY, undefined)
    toast(
      res.success && res.data.copied
        ? { variant: 'success', message: 'Report copied' }
        : { variant: 'error', message: 'Couldn’t copy the report. Try again.' }
    )
  }, [])
  /** Picks a different stash folder, then restarts into it. */
  const chooseFolder = useCallback(async () => {
    const picked = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (!picked.success || !picked.data.path) return
    const set = await window.api.invoke(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, {
      path: picked.data.path
    })
    if (set.success) relaunch()
    else toast({ variant: 'error', message: 'Couldn’t use that folder. Try another one.' })
  }, [relaunch])

  if (boot.state === 'loading' || boot.onboarded === null) {
    return (
      <CenteredLayout
        variant="bare"
        content={<LoadingState variant="inline" message="Digging up your stash…" />}
      />
    )
  }

  if (boot.state === 'library-failed' || boot.state === 'folder-unavailable') {
    const failed = boot.state === 'library-failed'
    return (
      <CenteredLayout
        content={
          <ErrorState
            variant="page"
            title={failed ? 'We couldn’t open your stash' : 'We can’t find your stash folder'}
            message={
              failed
                ? 'We couldn’t read your stash’s database. Don’t worry, your PSDs are safe. Try again, or pick a different stash folder.'
                : 'We can’t reach your stash folder. Is the drive plugged in?'
            }
            retryLabel="Try again"
            onRetry={relaunch}
            secondaryLabel="Choose a folder"
            onSecondary={() => void chooseFolder()}
            showDetails
            onCopyReport={() => void copyReport()}
          />
        }
      />
    )
  }

  if (boot.state === 'settings-corrupt') {
    return (
      <CenteredLayout
        content={
          <OnboardingStep
            variant="standard"
            step="3"
            title="Let’s set things up again"
            body="Your settings file got scrambled, so we reset it. Your stash is exactly where you left it."
            content={
              <Banner
                tone="warning"
                title="We reset your settings"
                message={
                  boot.backupKept
                    ? 'We kept a copy of the old ones, just in case.'
                    : 'We couldn’t keep a copy of the old ones.'
                }
                dismissible={false}
              />
            }
            skipLabel="Skip for now"
            onSkip={() => {
              boot.markOnboarded()
              boot.dismiss()
            }}
            primaryLabel="Continue"
            onPrimary={boot.dismiss}
          />
        }
      />
    )
  }

  if (!boot.onboarded) return <OnboardingFlow onComplete={boot.markOnboarded} />
  return <>{children}</>
}
