import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiModelInfo, AiDownloadProgress } from '@shared/ipc'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

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
    <div className="mt-6 border-t border-border pt-6">
      <h2 className="mb-1 text-lg font-semibold text-foreground">AI Tagging</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Download a model once to automatically tag imported mockups with title, description, and categories.
      </p>

      {hardware && (
        <p className="mb-4 text-xs text-muted-foreground">
          {hardware.chip} · {hardware.totalMemoryGB.toFixed(0)} GB ·{' '}
          <span className="text-primary">Recommended: {hardware.recommendedTier}</span>
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
              className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{model.name}</span>
                  {isRecommended && <Badge>Recommended</Badge>}
                  {model.installed && <Badge variant="secondary">Downloaded</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {model.tier} · {formatBytes(model.sizeBytes)} · downloaded once, runs offline
                </p>
                {progress && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full rounded-full bg-secondary">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {progress.phase === 'verifying' ? 'Verifying…' : `Downloading ${pct}%`}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!model.installed && !progress && (
                  <Button size="sm" onClick={() => void handleDownload(model.id)}>
                    Download
                  </Button>
                )}
                {progress && (
                  <Button variant="destructive" size="sm" onClick={() => void handleCancel(model.id)}>
                    Cancel
                  </Button>
                )}
                {model.installed && (
                  <input
                    type="radio"
                    name="active-model"
                    checked={model.active}
                    onChange={() => void handleSetActive(model.id)}
                    className="accent-primary"
                    title="Use this model"
                  />
                )}
                {model.installed && model.active && (
                  <Button variant="link" size="sm" onClick={() => void handleSetActive(null)}>
                    Disable
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
