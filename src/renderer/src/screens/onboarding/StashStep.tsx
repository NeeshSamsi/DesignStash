import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { ChoiceDialog } from '@renderer/components/ChoiceDialog'
import { OnboardingStep } from '@renderer/components/OnboardingStep'
import { PathField } from '@renderer/components/PathField'
import type { PathFieldState } from '@renderer/components/PathField/PathField.types'
import { folderHint, friendlyPath, locationTrail, shortPath, STASH_STEP } from './onboarding-copy'

export interface StashStepProps {
  onBack: () => void
  /** `moved`: a different folder was chosen, so the app restarts into it at the end. */
  onNext: (moved: boolean) => void
}

/**
 * The folder choice as one value. A folder that already holds a stash stays `unconfirmed` until the
 * person says to use it; picking again and cancelling puts back what was chosen before.
 */
type Choice =
  | { kind: 'current' }
  | { kind: 'checking'; before: Choice }
  | { kind: 'ready'; path: string }
  | { kind: 'unconfirmed'; path: string; before: Choice }
  | { kind: 'blocked'; path: string; hint: string }

const pathOf = (choice: Choice, current: string | null): string | null =>
  choice.kind === 'current'
    ? current
    : choice.kind === 'checking'
      ? pathOf(choice.before, current)
      : choice.path

/**
 * A2 · Where the stash lives. Choosing checks the folder first: unwritable and missing folders
 * explain themselves, and a folder that already holds a stash asks whether to use it.
 */
export function StashStep({ onBack, onNext }: StashStepProps) {
  const [current, setCurrent] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice>({ kind: 'current' })

  useEffect(() => {
    void window.api.invoke(IPC_CHANNELS.SETTINGS_GET, undefined).then((res) => {
      if (res.success) setCurrent(res.data.libraryRoot)
    })
  }, [])

  const choose = useCallback(async () => {
    const picked = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (!picked.success || !picked.data.path) return
    const path = picked.data.path
    setChoice((before) => ({ kind: 'checking', before }))
    const check = await window.api.invoke(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path })
    if (!check.success) {
      setChoice({ kind: 'blocked', path, hint: folderHint('not-writable') })
    } else if (check.data.state !== 'ok') {
      setChoice({ kind: 'blocked', path, hint: folderHint(check.data.state) })
    } else if (check.data.hasLibrary) {
      setChoice((before) => ({
        kind: 'unconfirmed',
        path,
        before: before.kind === 'checking' ? before.before : before
      }))
    } else {
      setChoice({ kind: 'ready', path })
    }
  }, [])

  const shown = pathOf(choice, current)
  const state: PathFieldState =
    choice.kind === 'checking'
      ? 'busy'
      : choice.kind === 'blocked'
        ? 'not-writable'
        : choice.kind === 'unconfirmed'
          ? 'existing-library'
          : 'default'
  const hint = choice.kind === 'blocked' ? choice.hint : undefined
  const blocked = shown === null || choice.kind === 'blocked' || choice.kind === 'unconfirmed'

  const proceed = async () => {
    if (choice.kind === 'ready') {
      const res = await window.api.invoke(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, {
        path: choice.path
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
              path={shortPath(friendlyPath(shown))}
              fullPath={friendlyPath(shown)}
              location={locationTrail(shown)}
              {...(hint ? { hint } : {})}
              onChoose={() => void choose()}
            />
          )
        }
        onBack={onBack}
        onPrimary={() => void proceed()}
        busy={choice.kind === 'checking'}
        busyLabel="Checking…"
        primaryDisabled={blocked}
      />
      <ChoiceDialog
        open={choice.kind === 'unconfirmed'}
        title="Looks like there’s already a stash here"
        description="It already has mockups in it. Want to use it, or pick somewhere else?"
        tertiaryLabel="Choose another"
        onTertiary={() => {
          // Back to what was chosen before, so cancelling the picker cannot leave this one standing.
          if (choice.kind === 'unconfirmed') setChoice(choice.before)
          void choose()
        }}
        secondaryLabel={null}
        primaryLabel="Use this stash"
        onPrimary={() => {
          if (choice.kind === 'unconfirmed') setChoice({ kind: 'ready', path: choice.path })
        }}
      />
    </>
  )
}
