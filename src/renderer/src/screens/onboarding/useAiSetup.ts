import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'
import { subscribePush } from '@renderer/lib/subscribe'
import { defaultSelection, partialDownload, type HardwareInfo } from './ai-setup'

export interface AiSetup {
  loaded: boolean
  hardware: HardwareInfo | null
  models: AiModelInfo[]
  aiOn: boolean
  selectedId: string | null
  /** The latest event for the download in flight (or that just ended). */
  event: AiDownloadProgress | null
  /** An earlier launch left a partial download: offer to pick it up. */
  partial: AiModelInfo | null
  setAiOn: (on: boolean) => void
  select: (id: string) => void
  reload: () => Promise<void>
  download: (id?: string) => Promise<void>
  cancel: () => Promise<void>
  startOver: (id: string) => Promise<void>
  dismissPartial: () => void
  /** Makes the selected model the one in use. Call when leaving the step with AI on. */
  activate: () => Promise<void>
}

/** Everything the AI step needs from main: hardware, the catalogue, and the download's progress. */
export function useAiSetup(): AiSetup {
  const [loaded, setLoaded] = useState(false)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [aiOn, setAiOn] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [event, setEvent] = useState<AiDownloadProgress | null>(null)
  const [partial, setPartial] = useState<AiModelInfo | null>(null)
  const chosen = useRef(false)

  const reload = useCallback(async () => {
    const [hw, list] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.AI_HARDWARE_INFO, undefined),
      window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined)
    ])
    const info = hw.success ? hw.data : null
    const found = list.success ? list.data.models : []
    setHardware(info)
    setModels(found)
    if (!chosen.current) {
      chosen.current = true
      setSelectedId(defaultSelection(found, info))
      setPartial(partialDownload(found))
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    return subscribePush(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, (next) => {
      setEvent(next)
      if (next.phase === 'done' || next.phase === 'error') void reload()
    })
  }, [reload])

  const download = useCallback(
    async (id?: string) => {
      const target = id ?? selectedId
      if (!target) return
      setSelectedId(target)
      setPartial(null)
      setEvent({ modelId: target, receivedBytes: 0, totalBytes: 0, phase: 'downloading' })
      const res = await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id: target })
      if (!res.success || !res.data.started) {
        setEvent({
          modelId: target,
          receivedBytes: 0,
          totalBytes: 0,
          phase: 'error',
          reason: 'server'
        })
      }
    },
    [selectedId]
  )

  const cancel = useCallback(async () => {
    if (!selectedId) return
    await window.api.invoke(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id: selectedId })
    setEvent(null)
    await reload()
  }, [selectedId, reload])

  const startOver = useCallback(
    async (id: string) => {
      setPartial(null)
      await window.api.invoke(IPC_CHANNELS.AI_DELETE_MODEL, { id })
      setEvent(null)
      await reload()
    },
    [reload]
  )

  const activate = useCallback(async () => {
    if (!selectedId) return
    await window.api.invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id: selectedId })
  }, [selectedId])

  return {
    loaded,
    hardware,
    models,
    aiOn,
    selectedId,
    event,
    partial,
    setAiOn,
    select: setSelectedId,
    reload,
    download,
    cancel,
    startOver,
    dismissPartial: () => setPartial(null),
    activate
  }
}
