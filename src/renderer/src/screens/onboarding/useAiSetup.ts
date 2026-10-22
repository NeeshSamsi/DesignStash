import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiDownloadProgress, AiMeaningInfo, AiModelInfo } from '@shared/ipc/ai'
import { defaultSelection, partialDownload } from './ai-setup'
import { backgroundEvent, stopBackground } from './background-download'
import type { HardwareInfo } from './model-phase'
import { useModelCatalogue } from './useModelCatalogue'

export interface AiSetup {
  loaded: boolean
  hardware: HardwareInfo | null
  models: AiModelInfo[]
  /** The meaning-search model and its download, started with the vision model. */
  meaning: AiMeaningInfo | null
  meaningEvent: AiDownloadProgress | null
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
  const {
    loaded,
    hardware,
    models,
    meaning,
    events,
    latest: event,
    setEvent,
    reload: reloadCatalogue
  } = catalogue
  const meaningEvent = meaning ? (events[meaning.id] ?? null) : null
  const [aiOn, setAiOn] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [partial, setPartial] = useState<AiModelInfo | null>(null)
  const chosen = useRef(false)

  // The first catalogue to arrive sets the default pick and offers a partial download.
  useEffect(() => {
    if (!loaded || chosen.current) return
    chosen.current = true
    setSelectedId(event?.modelId ?? defaultSelection(models, hardware))
    setPartial(event ? null : partialDownload(models))
  }, [loaded, models, hardware, event])

  const reload = useCallback(async () => {
    await reloadCatalogue()
  }, [reloadCatalogue])

  /** Meaning search downloads beside the vision model. Nothing to do when it is there or on its way. */
  const startMeaning = useCallback(async () => {
    if (!meaning || meaning.installed || meaningEvent?.phase === 'downloading') return
    setEvent(meaning.id, {
      modelId: meaning.id,
      receivedBytes: meaning.downloadedBytes,
      totalBytes: meaning.sizeBytes,
      phase: 'downloading'
    })
    const res = await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id: meaning.id })
    if (!res.success || !res.data.started) setEvent(meaning.id, null)
  }, [meaning, meaningEvent?.phase, setEvent])

  const download = useCallback(
    async (id?: string) => {
      const target = id ?? selectedId
      if (!target) return
      setSelectedId(target)
      setPartial(null)
      stopBackground()
      void startMeaning()
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
    [selectedId, setEvent, startMeaning]
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
    // A built-in model needs no download, so meaning search starts when the step is left.
    void startMeaning()
  }, [selectedId, startMeaning])

  return {
    loaded,
    hardware,
    models,
    meaning,
    meaningEvent,
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
