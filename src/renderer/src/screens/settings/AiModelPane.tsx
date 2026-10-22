import { useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiModelInfo } from '@shared/ipc/ai'
import { Banner } from '../../components/Banner'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { HardwareSummary } from '../../components/HardwareSummary'
import { ModelCard, type ModelCardProps } from '../../components/ModelCard'
import { SettingsGroup } from '../../components/SettingsLayout'
import { Switch } from '../../components/Switch'
import { activeProblemCopy } from '../../lib/model-notice'
import { cn } from '../../lib/utils'
import { toast, undoToast } from '../../stores/toastStore'
import { BUILT_IN_SIZE } from '../onboarding/ai-setup'
import { modelPhase } from '../onboarding/model-phase'
import { useModelCatalogue } from '../onboarding/useModelCatalogue'
import { downloadFailureCopy, downloadRate, downloadRemaining, formatBytes } from './settings-copy'

const languagesText = (languages: string[]) =>
  languages.length === 1 ? (languages[0] ?? '') : `${languages.length} languages`

/** Settings › AI model: this Mac, the on-device switch, and the model cards. Actions are buttons only. */
export function AiModelPane() {
  const { loaded, hardware, models, activeProblem, events, reload: load, setEvent } =
    useModelCatalogue()
  const [on, setOn] = useState(false)
  const started = useRef(false)
  const [deleting, setDeleting] = useState<AiModelInfo | null>(null)

  // The switch starts on when a model is in use (even one that can't run right now); after that
  // only the person changes it.
  useEffect(() => {
    if (!loaded || started.current) return
    started.current = true
    setOn(models.some((m) => m.active) || activeProblem !== null)
  }, [loaded, models, activeProblem])

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
    const model = models.find((m) => m.id === id)
    setEvent(id, {
      modelId: id,
      receivedBytes: model?.downloadedBytes ?? 0,
      totalBytes: model?.sizeBytes ?? 0,
      phase: 'downloading'
    })
    const res = await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id })
    if (!res.success || !res.data.started) {
      setEvent(id, null)
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
    setEvent(id, null)
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

  const supported = hardware ? hardware.isAppleSilicon : true

  const cardFor = (model: AiModelInfo) => {
    const status = modelPhase(model, events[model.id] ?? null)
    const state: ModelCardProps['state'] =
      status.phase === 'installed'
        ? model.active
          ? 'in-use'
          : 'downloaded'
        : status.phase === 'downloading' || status.phase === 'verifying'
          ? 'downloading'
          : status.phase === 'failed'
            ? 'failed'
            : 'available'
    return (
      <ModelCard
        key={model.id}
        state={state}
        name={model.name}
        description={model.description}
        languages={languagesText(model.languages)}
        size={model.builtIn ? BUILT_IN_SIZE : formatBytes(model.sizeBytes)}
        bestFit={model.bestFit}
        quality={model.quality}
        speed={model.speed}
        percent={status.percent}
        rate={downloadRate(status.bytesPerSecond)}
        remaining={downloadRemaining(status.secondsLeft)}
        failureReason={downloadFailureCopy(status.reason)}
        verifying={status.phase === 'verifying'}
        {...(status.phase === 'paused'
          ? {
              resumeNote: `${formatBytes(status.receivedBytes)} of ${formatBytes(status.totalBytes)} downloaded`
            }
          : {})}
        useDisabled={!on}
        deletable={!model.builtIn}
        downloadDisabled={!supported}
        onUse={() => void use(model.id)}
        onDownload={() => void download(model.id)}
        onCancel={() => void cancel(model.id)}
        onRetry={() => void download(model.id)}
        onDelete={() => (model.active ? setDeleting(model) : void remove(model, false))}
      />
    )
  }

  const yours = models
    .filter((m) => m.installed && !m.builtIn)
    .sort((a, b) => Number(b.active) - Number(a.active))
  // Apple's model, listed only on a Mac that can run it.
  const builtIn = models.filter((m) => m.builtIn)
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
            <p className="type-body-sm-regular text-muted-foreground">
              {!supported
                ? 'This Mac can’t run on-device AI. It needs Apple Silicon.'
                : on
                  ? 'Suggests titles and tags by looking at each cover. Nothing leaves your Mac.'
                  : 'Titles come from file names. Models you downloaded stay on your Mac.'}
            </p>
          </div>
          <Switch
            showLabel={false}
            aria-label="Use on-device AI"
            checked={on}
            disabled={!supported}
            onCheckedChange={(next) => void toggle(next)}
          />
        </div>
        {activeProblem && (
          <div className="px-4 pt-3.5">
            <Banner
              tone="warning"
              {...activeProblemCopy(activeProblem)}
              action={false}
              dismissible={false}
            />
          </div>
        )}
        {models.length > 0 && (
          <div className="flex flex-col gap-2 px-4 pt-3.5 pb-4">
            {!on && supported && (
              <p className="type-caption-xs-regular text-tertiary">Turn on AI to use a model.</p>
            )}
            {yours.length > 0 && (
              <>
                <p className="type-label-xs-medium text-tertiary">Your models</p>
                {yours.map(cardFor)}
              </>
            )}
            {builtIn.length > 0 && (
              <>
                <p className={cn('type-label-xs-medium text-tertiary', yours.length > 0 && 'mt-2')}>
                  Built into macOS
                </p>
                {builtIn.map(cardFor)}
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
