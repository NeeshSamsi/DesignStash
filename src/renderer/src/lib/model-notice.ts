import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiActiveProblem } from '@shared/ipc/ai'
import { toast } from '../stores/toastStore'
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
  }
}

/**
 * The app-wide notice for an active model that can't run (Apple's, with Apple Intelligence turned
 * off): one toast with Choose a model, at launch and when the window comes back, only when the
 * problem is new. Settings › AI model shows the same words while it lasts.
 */
export function useActiveModelNotice(): void {
  const last = useRef<AiActiveProblem | null>(null)

  useEffect(() => {
    const check = async () => {
      const res = await window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined).catch(() => null)
      if (!res?.success) return
      const problem = res.data.activeProblem
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
    return () => window.removeEventListener('focus', onFocus)
  }, [])
}
