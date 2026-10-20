import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'
import { defaultSelection, partialDownload } from './ai-setup'
import { backgroundEvent, stopBackground } from './background-download'
import type { HardwareInfo } from './model-phase'
import { useModelCatalogue } from './useModelCatalogue'

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
  const catalogue = useModelCatalogue(backgroundEvent())
  const { loaded, hardware, models, latest: event, setEvent, reload: reloadCatalogue } = catalogue
  const [aiOn, setAiOn] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [partial, setPartial] = useState<AiModelInfo | null>(null)
  const chosen = useRef(false)

  // The first catalogue to arrive sets the default pick and offers a partial download.
  useEffect(() => {
    if (!loaded || chosen.current) return
    chosen.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(event?.modelId ?? defaultSelection(models, hardware))
    setPartial(event ? null : partialDownload(models))
  }, [loaded, models, hardware, event])

  const reload = useCallback(async () => {
    await reloadCatalogue()
  }, [reloadCatalogue])

  const download = useCallback(
    async (id?: string) => {
      const target = id ?? selectedId
      if (!target) return
      setSelectedId(target)
      setPartial(null)
      stopBackground()
      setEvent(target, { modelId: target, receivedBytes: 0, totalBytes: 0, phase: 'downloading' })
      const res = await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id: target })
      if (!res.success || !res.data.started) {
        setEvent(target, {
          modelId: target,
          receivedBytes: 0,
          totalBytes: 0,
          phase: 'error',
          reason: 'server'
        })
      }
    },
    [selectedId, setEvent]
  )

  const cancel = useCallback(async () => {
    if (!selectedId) return
    stopBackground()
    await window.api.invoke(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id: selectedId })
    setEvent(selectedId, null)
    await reloadCatalogue()
  }, [selectedId, setEvent, reloadCatalogue])

  const startOver = useCallback(
    async (id: string) => {
      setPartial(null)
      await window.api.invoke(IPC_CHANNELS.AI_DELETE_MODEL, { id })
      setEvent(id, null)
      await reloadCatalogue()
    },
    [setEvent, reloadCatalogue]
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
