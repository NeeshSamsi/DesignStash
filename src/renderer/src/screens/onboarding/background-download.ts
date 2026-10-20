import { IPC_CHANNELS } from '@shared/ipc'
import type { AiDownloadProgress } from '@shared/ipc/ai'
import { subscribePush } from '@renderer/lib/subscribe'
import { toast } from '@renderer/stores/toastStore'

interface Watch {
  modelId: string
  name: string
  latest: AiDownloadProgress | null
  stop: () => void
}

let watch: Watch | null = null

/**
 * Lets a model download carry on after the AI step is gone. When it finishes the model is switched
 * on and a toast says so; if it stops, the toast says that instead. This lives outside React
 * because the step unmounts the moment the person moves on.
 */
export function continueInBackground(model: { id: string; name: string }): void {
  if (watch?.modelId === model.id) return
  stopBackground()
  const mine: Watch = { modelId: model.id, name: model.name, latest: null, stop: () => {} }
  mine.stop = subscribePush(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, (event) => {
    if (event.modelId !== mine.modelId) return
    mine.latest = event
    if (event.phase === 'done') {
      stopBackground()
      void window.api
        .invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id: mine.modelId })
        .then(() => toast({ variant: 'success', message: `${mine.name} is ready and switched on` }))
        .catch(() =>
          toast({
            variant: 'error',
            message: `${mine.name} finished downloading`,
            description: 'Turn it on in Settings › AI model.'
          })
        )
    } else if (event.phase === 'error') {
      stopBackground()
      toast({
        variant: 'error',
        message: `${mine.name} didn’t finish downloading`,
        description: 'Try again in Settings › AI model.'
      })
    }
  })
  watch = mine
}

/** The latest event of the download carrying on in the background, so the AI step can pick it up again. */
export function backgroundEvent(): AiDownloadProgress | null {
  return watch?.latest ?? null
}

export function stopBackground(): void {
  watch?.stop()
  watch = null
}
