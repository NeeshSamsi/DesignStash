import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { ChoiceDialog } from '@renderer/components/ChoiceDialog'
import { OnboardingStep } from '@renderer/components/OnboardingStep'
import { PathField } from '@renderer/components/PathField'
import type { PathFieldState } from '@renderer/components/PathField/PathField.types'
import { folderHint, friendlyPath, locationTrail, STASH_STEP } from './onboarding-copy'

export interface StashStepProps {
  onBack: () => void
  /** `moved`: a different folder was chosen, so the app restarts into it at the end. */
  onNext: (moved: boolean) => void
}

type Found = { path: string; state: PathFieldState }

/**
 * A2 · Where the stash lives. Choosing checks the folder first: unwritable and missing folders
 * explain themselves, and a folder that already holds a stash asks whether to use it.
 */
export function StashStep({ onBack, onNext }: StashStepProps) {
  const [current, setCurrent] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Found | null>(null)
  const [hint, setHint] = useState<string | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    void window.api.invoke(IPC_CHANNELS.SETTINGS_GET, undefined).then((res) => {
      if (res.success) setCurrent(res.data.libraryRoot)
    })
  }, [])

  const choose = useCallback(async () => {
    const picked = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (!picked.success || !picked.data.path) return
    const path = picked.data.path
    setChecking(true)
    const check = await window.api.invoke(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path })
    setChecking(false)
    if (!check.success) {
      setChosen({ path, state: 'not-writable' })
      setHint(folderHint('not-writable'))
      return
    }
    if (check.data.state !== 'ok') {
      setChosen({ path, state: 'not-writable' })
      setHint(folderHint(check.data.state))
    } else if (check.data.hasLibrary) {
      setChosen({ path, state: 'existing-library' })
      setHint(undefined)
      setAsking(true)
    } else {
      setChosen({ path, state: 'default' })
      setHint(undefined)
    }
  }, [])

  const shown = chosen?.path ?? current
  const state: PathFieldState = checking ? 'busy' : (chosen?.state ?? 'default')
  const blocked = shown === null || state === 'not-writable'

  const proceed = async () => {
    if (chosen && chosen.state !== 'not-writable') {
      const res = await window.api.invoke(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, {
        path: chosen.path
      })
      if (res.success) return onNext(res.data.libraryRoot !== current)
    }
    onNext(false)
  }

  return (
    <>
      <OnboardingStep
        variant="standard"
        step="2"
        title={STASH_STEP.title}
        body={STASH_STEP.body}
        content={
          shown !== null && (
            <PathField
              state={state}
              path={friendlyPath(shown)}
              location={locationTrail(shown)}
              {...(hint ? { hint } : {})}
              onChoose={() => void choose()}
            />
          )
        }
        onBack={onBack}
        onPrimary={() => void proceed()}
        busy={checking}
        busyLabel="Checking…"
        primaryDisabled={blocked}
      />
      <ChoiceDialog
        open={asking}
        title="Looks like there’s already a stash here"
        description="It already has mockups in it. Want to use it, or pick somewhere else?"
        tertiaryLabel="Choose another"
        onTertiary={() => {
          setAsking(false)
          void choose()
        }}
        secondaryLabel={null}
        primaryLabel="Use this stash"
        onPrimary={() => {
          setAsking(false)
          setChosen((found) => (found ? { ...found, state: 'default' } : found))
        }}
      />
    </>
  )
}
