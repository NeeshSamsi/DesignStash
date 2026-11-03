import { useCallback, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { CenteredLayout } from '@renderer/components/CenteredLayout'
import { ConsentPanel } from '@renderer/components/ConsentPanel'
import { OnboardingStep } from '@renderer/components/OnboardingStep'
import { AiStep } from './AiStep'
import { StashStep } from './StashStep'
import { DONE_STEP, PRIVACY_STEP, WELCOME } from './onboarding-copy'

export type OnboardingPage = 'welcome' | 'stash' | 'ai' | 'privacy' | 'done'

const ORDER: OnboardingPage[] = ['welcome', 'stash', 'ai', 'privacy', 'done']

export interface OnboardingFlowProps {
  /** Opens My Stash. */
  onComplete: () => void
  /** Where to start. Boot's “settings were reset” screen starts at the stash step. */
  start?: OnboardingPage
}

/**
 * The five first-run pages inside the centred layout: welcome, stash folder, AI setup, privacy and
 * all set. Figma: ↳ Start › A · Onboarding, A3 · AI setup.
 * Choosing a different stash folder takes effect on the next launch, so the last button restarts
 * the app into it instead of opening the old one.
 */
export function OnboardingFlow({ onComplete, start = 'welcome' }: OnboardingFlowProps) {
  const [page, setPage] = useState<OnboardingPage>(start)
  const [moved, setMoved] = useState(false)
  const [deciding, setDeciding] = useState(false)
  // Anonymous usage data is on until the person switches it off (opt-out).
  const [share, setShare] = useState(true)

  const go = useCallback((delta: 1 | -1) => {
    setPage(
      (current) =>
        ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(current) + delta))] ?? current
    )
  }, [])

  const decide = async () => {
    setDeciding(true)
    await window.api.invoke(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled: share })
    setDeciding(false)
    go(1)
  }

  const finish = () => {
    if (moved) void window.api.invoke(IPC_CHANNELS.APP_RELAUNCH, undefined)
    else onComplete()
  }

  return (
    <CenteredLayout
      variant="card"
      content={
        <>
          {page === 'welcome' && (
            <OnboardingStep
              variant="welcome"
              title={WELCOME.title}
              body={WELCOME.body}
              onPrimary={() => go(1)}
            />
          )}
          {page === 'stash' && (
            <StashStep
              onBack={() => go(-1)}
              onNext={(changed) => {
                if (changed) setMoved(true)
                go(1)
              }}
            />
          )}
          {page === 'ai' && <AiStep onBack={() => go(-1)} onNext={() => go(1)} />}
          {page === 'privacy' && (
            <OnboardingStep
              variant="standard"
              step="4"
              title={PRIVACY_STEP.title}
              body={PRIVACY_STEP.body}
              busyLabel="Saving…"
              onBack={() => go(-1)}
              onPrimary={() => void decide()}
              busy={deciding}
              content={<ConsentPanel mode="card" enabled={share} onEnabledChange={setShare} />}
            />
          )}
          {page === 'done' && (
            <OnboardingStep
              variant="standard"
              step="5"
              title={DONE_STEP.title}
              body={DONE_STEP.body}
              content={null}
              primaryLabel="Open My Stash"
              onBack={() => go(-1)}
              onPrimary={finish}
            />
          )}
        </>
      }
    />
  )
}
