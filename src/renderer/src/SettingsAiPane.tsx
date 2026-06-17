// PLACEHOLDER UI — replace in design pass
import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiModelInfo, AiDownloadProgress } from '@shared/ipc'

interface HardwareInfo {
  chip: string
  totalMemoryGB: number
  isAppleSilicon: boolean
  recommendedTier: 'small' | 'medium' | 'large'
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

export default function SettingsAiPane() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [downloading, setDownloading] = useState<Record<string, AiDownloadProgress>>({})

  const refreshModels = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined)
    if (res.success) setModels(res.data.models)
  }, [])

  useEffect(() => {
    void (async () => {
      const hw = await window.api.invoke(IPC_CHANNELS.AI_HARDWARE_INFO, undefined)
      if (hw.success) setHardware(hw.data)
      await refreshModels()
    })()

    const unsub = window.api.onAiDownloadProgress((progress) => {
      setDownloading((prev) => {
        if (progress.phase === 'done' || progress.phase === 'error') {
          const next = { ...prev }
          delete next[progress.modelId]
          void refreshModels()
          return next
        }
        return { ...prev, [progress.modelId]: progress }
      })
    })
    return () => unsub()
  }, [refreshModels])

  const handleDownload = async (id: string) => {
    await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id })
  }

  const handleCancel = async (id: string) => {
    await window.api.invoke(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id })
  }

  const handleSetActive = async (id: string | null) => {
    await window.api.invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id })
    await refreshModels()
  }

  return (
    <div className="mt-6 border-t border-neutral-700 pt-6">
      <h2 className="text-lg font-semibold text-white mb-1">AI Tagging</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Download a model once to automatically tag imported mockups with title, description, and categories.
      </p>

      {hardware && (
        <p className="text-xs text-neutral-500 mb-4">
          {hardware.chip} · {hardware.totalMemoryGB.toFixed(0)} GB ·{' '}
          <span className="text-blue-400">Recommended: {hardware.recommendedTier}</span>
        </p>
      )}

      <div className="space-y-3">
        {models.map((model) => {
          const progress = downloading[model.id]
          const pct =
            progress && progress.totalBytes > 0
              ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
              : 0
          const isRecommended = hardware?.recommendedTier === model.tier

          return (
            <div
              key={model.id}
              className="bg-neutral-700 rounded-lg p-3 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{model.name}</span>
                  {isRecommended && (
                    <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">
                      Recommended
                    </span>
                  )}
                  {model.installed && (
                    <span className="text-xs bg-green-700 text-green-200 px-1.5 py-0.5 rounded">
                      Downloaded
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {model.tier} · {formatBytes(model.sizeBytes)} · downloaded once, runs offline
                </p>
                {progress && (
                  <div className="mt-2">
                    <div className="w-full bg-neutral-600 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {progress.phase === 'verifying' ? 'Verifying…' : `Downloading ${pct}%`}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!model.installed && !progress && (
                  <button
                    onClick={() => void handleDownload(model.id)}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
                  >
                    Download
                  </button>
                )}
                {progress && (
                  <button
                    onClick={() => void handleCancel(model.id)}
                    className="text-xs bg-neutral-600 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {model.installed && (
                  <input
                    type="radio"
                    name="active-model"
                    checked={model.active}
                    onChange={() => void handleSetActive(model.id)}
                    className="accent-blue-500"
                    title="Use this model"
                  />
                )}
                {model.installed && model.active && (
                  <button
                    onClick={() => void handleSetActive(null)}
                    className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
                  >
                    Disable
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
