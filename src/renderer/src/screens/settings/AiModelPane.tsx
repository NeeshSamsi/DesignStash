import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { HardwareSummary } from '../../components/HardwareSummary'
import { ModelCard, type ModelCardProps } from '../../components/ModelCard'
import { SettingsGroup } from '../../components/SettingsLayout'
import { Switch } from '../../components/Switch'
import { subscribePush } from '../../lib/subscribe'
import { toast, undoToast } from '../../stores/toastStore'
import { downloadFailureCopy, downloadRate, downloadRemaining, formatBytes } from './settings-copy'

interface Hardware {
  chip: string
  totalMemoryGB: number
  isAppleSilicon: boolean
  recommendedTier: 'small' | 'medium' | 'large'
}

const languagesText = (languages: string[]) =>
  languages.length === 1 ? (languages[0] ?? '') : `${languages.length} languages`

/** Settings › AI model: this Mac, the on-device switch, and the model cards. Actions are buttons only. */
export function AiModelPane() {
  const [hardware, setHardware] = useState<Hardware | null>(null)
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [progress, setProgress] = useState<Record<string, AiDownloadProgress>>({})
  const [on, setOn] = useState(false)
  const [deleting, setDeleting] = useState<AiModelInfo | null>(null)

  const load = useCallback(async () => {
    const [hw, list] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.AI_HARDWARE_INFO, undefined),
      window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined)
    ])
    if (hw.success) setHardware(hw.data)
    if (list.success) {
      setModels(list.data.models)
      return list.data.models
    }
    return null
  }, [])

  // The switch starts on when a model is in use; after that only the person changes it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then((list) => {
      if (list) setOn(list.some((m) => m.active))
    })
  }, [load])

  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, (p) => {
        setProgress((current) => ({ ...current, [p.modelId]: p }))
        if (p.phase === 'done') void load()
      }),
    [load]
  )

  const toggle = async (next: boolean) => {
    setOn(next)
    if (!next) {
      await window.api.invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id: null })
    } else {
      const ready = models.find((m) => m.installed)
      if (ready) await window.api.invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id: ready.id })
    }
    void load()
  }

  const use = async (id: string) => {
    await window.api.invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id })
    void load()
  }
  const download = async (id: string) => {
    setProgress((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== id))
    )
    const res = await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id })
    if (!res.success || !res.data.started) {
      toast({
        variant: 'error',
        message: 'Couldn’t start the download',
        description: 'Check your connection, then try again.'
      })
    }
    void load()
  }
  const cancel = async (id: string) => {
    await window.api.invoke(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id })
    void load()
  }

  const remove = async (model: AiModelInfo, confirmed: boolean) => {
    const res = await window.api.invoke(IPC_CHANNELS.AI_DELETE_MODEL, {
      id: model.id,
      ...(confirmed ? { confirmed: true } : {})
    })
    if (!res.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t delete the model',
        description: 'Nothing was changed. Try again.'
      })
      return
    }
    if (res.data.inUse && !res.data.deleted) {
      setDeleting(model)
      return
    }
    void load()
    if (res.data.undoable) {
      undoToast(`${model.name} deleted`, () => {
        void window.api
          .invoke(IPC_CHANNELS.AI_RESTORE_MODEL, {
            id: model.id,
            ...(confirmed ? { makeActive: true } : {})
          })
          .then(() => load())
      })
    }
  }

  const cardFor = (model: AiModelInfo) => {
    const p = progress[model.id]
    const busy = p && (p.phase === 'downloading' || p.phase === 'verifying')
    const stopped = !model.installed && (p?.phase === 'error' || (!p && model.downloadedBytes > 0))
    const state: ModelCardProps['state'] = model.installed
      ? model.active
        ? 'in-use'
        : 'downloaded'
      : busy
        ? 'downloading'
        : stopped
          ? 'failed'
          : 'available'
    const percent = p && p.totalBytes > 0 ? (p.receivedBytes / p.totalBytes) * 100 : 0
    return (
      <ModelCard
        key={model.id}
        state={state}
        name={model.name}
        description={model.description}
        languages={languagesText(model.languages)}
        size={formatBytes(model.sizeBytes)}
        bestFit={model.bestFit}
        quality={model.quality}
        speed={model.speed}
        percent={percent}
        rate={downloadRate(p?.bytesPerSecond)}
        remaining={downloadRemaining(p?.secondsLeft)}
        failureReason={downloadFailureCopy(p?.reason)}
        onUse={() => void use(model.id)}
        onDownload={() => void download(model.id)}
        onCancel={() => void cancel(model.id)}
        onRetry={() => void download(model.id)}
        onDelete={() => (model.active ? setDeleting(model) : void remove(model, false))}
      />
    )
  }

  const yours = models
    .filter((m) => m.installed)
    .sort((a, b) => Number(b.active) - Number(a.active))
  const available = models.filter((m) => !m.installed)

  const mac = hardware ? (
    hardware.isAppleSilicon ? (
      <HardwareSummary
        variant="supported"
        title={`${hardware.chip} · ${hardware.totalMemoryGB} GB memory`}
        description={`Your Mac can comfortably run ${hardware.recommendedTier} models.`}
      />
    ) : (
      <HardwareSummary
        variant="unsupported"
        title={`${hardware.chip} · ${hardware.totalMemoryGB} GB memory`}
      />
    )
  ) : null

  return (
    <>
      {mac}
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="type-body-sm-medium text-foreground">Use on-device AI</p>
            <p className="type-body-sm-regular text-secondary">
              {on
                ? 'Suggests titles and tags by looking at each cover. Nothing leaves your Mac.'
                : 'Titles come from file names. Models you downloaded stay on your Mac.'}
            </p>
          </div>
          <Switch
            showLabel={false}
            aria-label="Use on-device AI"
            checked={on}
            disabled={hardware ? !hardware.isAppleSilicon : false}
            onCheckedChange={(next) => void toggle(next)}
          />
        </div>
        {on && (
          <div className="flex flex-col gap-2 px-4 pt-3.5 pb-4">
            {yours.length > 0 && (
              <>
                <p className="type-label-xs-medium text-tertiary">Your models</p>
                {yours.map(cardFor)}
              </>
            )}
            {available.length > 0 && (
              <>
                <p className="mt-2 type-label-xs-medium text-tertiary">Available to download</p>
                {available.map(cardFor)}
              </>
            )}
          </div>
        )}
      </SettingsGroup>
      <ConfirmDialog
        open={deleting !== null}
        variant="destructive"
        detail={false}
        title={`Delete ${deleting?.name ?? 'this model'}?`}
        description="It’s the model in use. AI titles and tags stop until you pick another model."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const model = deleting
          setDeleting(null)
          if (model) void remove(model, true)
        }}
      />
    </>
  )
}
