import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'
import { subscribePush } from '@renderer/lib/subscribe'
import type { HardwareInfo } from './model-phase'

export interface ModelCatalogue {
  loaded: boolean
  hardware: HardwareInfo | null
  models: AiModelInfo[]
  /** The latest download event for each model. */
  events: Record<string, AiDownloadProgress>
  /** The latest event of any model: the download in flight, or the one that just ended. */
  latest: AiDownloadProgress | null
  /** Loads the catalogue again. A failed load keeps what is already shown. */
  reload: () => Promise<AiModelInfo[] | null>
  /** Sets the event for a model by hand (a download just started or failed to start), or clears it. */
  setEvent: (modelId: string, event: AiDownloadProgress | null) => void
}

/**
 * Hardware, the model list and download events, shared by onboarding and Settings › AI model.
 * It reloads when a download ends either way, so sizes and installed flags are never stale.
 */
export function useModelCatalogue(seed?: AiDownloadProgress | null): ModelCatalogue {
  const [loaded, setLoaded] = useState(false)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [events, setEvents] = useState<Record<string, AiDownloadProgress>>(() =>
    seed ? { [seed.modelId]: seed } : {}
  )
  const [latest, setLatest] = useState<AiDownloadProgress | null>(seed ?? null)

  const reload = useCallback(async () => {
    const [hw, list] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.AI_HARDWARE_INFO, undefined).catch(() => null),
      window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined).catch(() => null)
    ])
    if (hw?.success) setHardware(hw.data)
    if (list?.success) setModels(list.data.models)
    setLoaded(true)
    return list?.success ? list.data.models : null
  }, [])

  const setEvent = useCallback((modelId: string, event: AiDownloadProgress | null) => {
    setEvents((current) => {
      if (event) return { ...current, [modelId]: event }
      return Object.fromEntries(Object.entries(current).filter(([id]) => id !== modelId))
    })
    setLatest((current) => (event ? event : current?.modelId === modelId ? null : current))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    return subscribePush(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, (next) => {
      setEvent(next.modelId, next)
      if (next.phase === 'done' || next.phase === 'error') void reload()
    })
  }, [reload, setEvent])

  return { loaded, hardware, models, events, latest, reload, setEvent }
}
