import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiActiveProblem } from '@shared/ipc/ai'
import { toast } from '../stores/toastStore'
import { subscribePush } from './subscribe'
import { useUiStore } from '../stores/uiStore'

/** Why the active model makes no suggestions, for the toast and Settings › AI model. */
export function activeProblemCopy(problem: AiActiveProblem): { title: string; message: string } {
  switch (problem) {
    case 'apple-intelligence-off':
      return {
        title: 'Apple Intelligence is turned off',
        message:
          'Apple’s on-device model needs it, so new mockups get no suggestions. Turn it on in System Settings, or choose another model.'
      }
    case 'apple-model-not-ready':
      return {
        title: 'Apple’s model isn’t ready yet',
        message:
          'macOS is still getting it ready, so new mockups get no suggestions for now. You can choose another model meanwhile.'
      }
    case 'apple-unavailable':
      return {
        title: 'Apple’s on-device model isn’t available',
        message: 'New mockups get no suggestions until you choose another model.'
      }
    case 'runtime-failed':
      return {
        title: 'The AI model won’t start',
        message:
          'It stopped twice while loading, so new mockups get no suggestions. You can choose another model, or send a report from Help › Report a Problem.'
      }
    case 'runtime-missing':
      return {
        title: 'Part of DesignStash is missing',
        message: 'The program that runs AI models isn’t in the app, so new mockups get no suggestions. Reinstalling DesignStash brings it back.'
      }
  }
}

/**
 * The app-wide notice for an active model that can't run (Apple's, with Apple Intelligence turned
 * off, or a runtime that won't start or is missing): one toast with Choose a model, at launch, when
 * the window comes back and when a mockup couldn't be written, only when the problem is new.
 * Settings › AI model shows the same words while it lasts.
 */
export function useActiveModelNotice(): void {
  const last = useRef<AiActiveProblem | null>(null)

  useEffect(() => {
    const check = async () => {
      const res = await window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined).catch(() => null)
      if (!res?.success) return
      const problem = res.data.activeProblem ?? null
      const isNew = problem !== null && problem !== last.current
      last.current = problem
      if (!isNew) return
      const { title, message } = activeProblemCopy(problem)
      toast({
        variant: 'error',
        message: title,
        description: message,
        action: {
          label: 'Choose a model',
          onClick: () => useUiStore.getState().openSettings('ai-model')
        }
      })
    }
    void check()
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    // A mockup the AI couldn't write may be the runtime itself failing (F-038).
    const unsubscribe = subscribePush(IPC_CHANNELS.AI_STATUS, (event) => {
      if (event.updates.some((u) => u.status === 'failed')) void check()
    })
    return () => {
      window.removeEventListener('focus', onFocus)
      unsubscribe()
    }
  }, [])
}
