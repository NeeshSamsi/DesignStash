import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiModelInfo, AiDownloadProgress } from '@shared/ipc'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

// ── types ────────────────────────────────────────────────────────────────────

type OnboardingStep = 'welcome' | 'library' | 'ai' | 'privacy' | 'done'

const STEPS: OnboardingStep[] = ['welcome', 'library', 'ai', 'privacy', 'done']

interface StepProps {
  onNext: () => void
}

interface BackableStepProps extends StepProps {
  onBack: () => void
}

// ── shared card shell ─────────────────────────────────────────────────────────

function OnboardingCard({
  step,
  children,
}: {
  step: OnboardingStep
  children: React.ReactNode
}) {
  const idx = STEPS.indexOf(step)
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 font-sans">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-card-foreground shadow-2xl">
        <div className="mb-6 flex justify-center gap-1.5" aria-label="Step progress">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i <= idx ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Step 1: Welcome ────────────────────────────────────────────────────────────

function StepWelcome({ onNext }: StepProps) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-foreground">Welcome to DesignStash</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Your local-first library for organising and searching mockups. Your files stay on your Mac
        — no cloud, no account.
      </p>
      <Button size="lg" onClick={onNext}>
        Get Started
      </Button>
    </div>
  )
}

// ── Step 2: Library location ───────────────────────────────────────────────────

function StepLibrary({ onNext, onBack }: BackableStepProps) {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET, undefined)
      if (res.success) setLibraryPath(res.data.libraryRoot)
    })()
  }, [])

  const handleChooseFolder = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (res.success && res.data.path) {
      setBusy(true)
      const setRes = await window.api.invoke(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, {
        path: res.data.path,
      })
      setBusy(false)
      if (setRes.success) setLibraryPath(setRes.data.libraryRoot)
    }
  }, [])

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold text-foreground">Choose your library location</h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        DesignStash manages its own folder — your PSD files are copied in and the app handles
        everything from there. You won&apos;t need to browse to it in Finder.
      </p>
      <div className="mb-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <p className="mb-0.5 text-xs text-muted-foreground">Library location</p>
        <p className="truncate font-mono text-sm text-foreground">
          {libraryPath ?? '~/Library/Application Support/DesignStash'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="secondary" onClick={() => void handleChooseFolder()} disabled={busy}>
          Choose a different folder…
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  )
}

// ── Step 3: AI setup ───────────────────────────────────────────────────────────

type AiMode = 'choose' | 'downloading'

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

function StepAI({ onNext, onBack }: BackableStepProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [aiMode, setAiMode] = useState<AiMode>('choose')
  const [enableAI, setEnableAI] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<AiDownloadProgress | null>(null)
  const [downloadDone, setDownloadDone] = useState(false)

  // Load hardware info once on mount
  useEffect(() => {
    void (async () => {
      const hw = await window.api.invoke(IPC_CHANNELS.AI_HARDWARE_INFO, undefined)
      if (hw.success) setHardware(hw.data)
    })()
  }, [])

  // Load models once hardware is known; pre-select the recommended tier using
  // functional setState so 'selected' is not a dependency (avoids a re-run loop).
  useEffect(() => {
    if (!hardware) return
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined)
      if (res.success) {
        const list = res.data.models
        setModels(list)
        setSelected((prev) => {
          if (prev !== null) return prev
          const rec = list.find((m) => m.tier === hardware.recommendedTier)
          return rec?.id ?? list[0]?.id ?? null
        })
      }
    })()
  }, [hardware])

  // Refresh the model list only (no selection change) — used after download completes.
  const refreshModels = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.AI_LIST_MODELS, undefined)
    if (res.success) setModels(res.data.models)
  }, [])

  useEffect(() => {
    const unsub = window.api.onAiDownloadProgress((progress) => {
      if (progress.phase === 'done') {
        setDownloadProgress(null)
        setDownloadDone(true)
        void refreshModels()
      } else if (progress.phase === 'error') {
        setDownloadProgress(null)
        setAiMode('choose')
      } else {
        setDownloadProgress(progress)
      }
    })
    return () => unsub()
  }, [refreshModels])

  const handleDownload = useCallback(async () => {
    if (!selected) return
    setDownloadDone(false)
    setAiMode('downloading')
    await window.api.invoke(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id: selected })
  }, [selected])

  const handleCancel = useCallback(async () => {
    if (!selected) return
    await window.api.invoke(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id: selected })
    setDownloadProgress(null)
    setAiMode('choose')
  }, [selected])

  const handleContinue = useCallback(async () => {
    if (downloadDone && selected) {
      await window.api.invoke(IPC_CHANNELS.AI_SET_ACTIVE, { id: selected })
    }
    onNext()
  }, [downloadDone, selected, onNext])

  const pct =
    downloadProgress && downloadProgress.totalBytes > 0
      ? Math.round((downloadProgress.receivedBytes / downloadProgress.totalBytes) * 100)
      : 0

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold text-foreground">On-device AI tagging</h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        A small model runs entirely on your Mac — no internet needed after download. It
        auto-generates titles, descriptions, and tags for imported mockups.
      </p>

      {hardware && (
        <p className="mb-4 text-xs text-muted-foreground">
          {hardware.chip} · {hardware.totalMemoryGB.toFixed(0)} GB RAM ·{' '}
          <span className="text-primary">Recommended: {hardware.recommendedTier}</span>
        </p>
      )}

      {/* Enable / Skip toggle */}
      {aiMode === 'choose' && (
        <div className="mb-4 flex gap-2">
          <Button
            variant={enableAI ? 'default' : 'secondary'}
            className="flex-1"
            onClick={() => setEnableAI(true)}
          >
            Enable AI (recommended)
          </Button>
          <Button
            variant={!enableAI ? 'default' : 'secondary'}
            className="flex-1"
            onClick={() => setEnableAI(false)}
          >
            Skip for now
          </Button>
        </div>
      )}

      {/* Model list (only when enabling) */}
      {aiMode === 'choose' && enableAI && (
        <div className="mb-4 max-h-48 space-y-2 overflow-y-auto">
          {models.map((model) => {
            const isRecommended = hardware?.recommendedTier === model.tier
            const isSelected = selected === model.id
            return (
              <button
                key={model.id}
                onClick={() => setSelected(model.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/50 hover:bg-muted'
                }`}
              >
                <div
                  className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{model.name}</span>
                    {isRecommended && <Badge>Recommended</Badge>}
                    {model.installed && <Badge variant="secondary">Downloaded</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(model.sizeBytes)} · {model.tier}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Blocking download progress */}
      {aiMode === 'downloading' && !downloadDone && (
        <div className="mb-6">
          <p className="mb-2 text-sm text-foreground">
            {downloadProgress?.phase === 'verifying' ? 'Verifying model…' : `Downloading… ${pct}%`}
          </p>
          <div className="mb-3 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => void handleCancel()}>
            Cancel download
          </Button>
        </div>
      )}

      {/* Download complete */}
      {downloadDone && (
        <div className="mb-4 flex items-center gap-2 text-sm text-primary">
          <span>✓</span>
          <span>Model downloaded and ready</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={aiMode === 'downloading' && !downloadDone}
        >
          ← Back
        </Button>
        {aiMode === 'choose' && enableAI && (
          <Button size="lg" onClick={() => void handleDownload()} disabled={!selected}>
            Download &amp; Enable
          </Button>
        )}
        {aiMode === 'choose' && !enableAI && (
          <Button variant="secondary" size="lg" onClick={onNext}>
            Skip — use manual tagging
          </Button>
        )}
        {aiMode === 'downloading' && downloadDone && (
          <Button size="lg" onClick={() => void handleContinue()}>
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Privacy ────────────────────────────────────────────────────────────

function StepPrivacy({ onNext, onBack }: BackableStepProps) {
  const [busy, setBusy] = useState(false)

  const decide = useCallback(
    async (enabled: boolean) => {
      setBusy(true)
      await window.api.invoke(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled })
      setBusy(false)
      onNext()
    },
    [onNext]
  )

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold text-foreground">
        Help improve DesignStash (optional)
      </h2>
      <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
        We collect anonymous usage data — which features you use, how long things take, your
        Mac&apos;s chip/memory tier, and crash reports. We{' '}
        <strong className="text-foreground">never</strong> see your files, file names, images, or
        the titles/tags you create. There&apos;s no account and no personal info. You can turn this
        off anytime in Settings.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          ← Back
        </Button>
        <Button onClick={() => void decide(true)} disabled={busy}>
          Keep it on
        </Button>
        <Button variant="secondary" onClick={() => void decide(false)} disabled={busy}>
          No thanks
        </Button>
      </div>
    </div>
  )
}

// ── Step 5: Done ───────────────────────────────────────────────────────────────

function StepDone({ onEnter, onBack }: { onEnter: () => void; onBack: () => void }) {
  return (
    <div>
      <h2 className="mb-2 text-xl font-bold text-foreground">You&apos;re all set!</h2>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Your library is ready. Import your first mockups using the{' '}
        <strong className="text-foreground">+ Files</strong> or{' '}
        <strong className="text-foreground">+ Folder</strong> buttons in the sidebar.
      </p>
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button size="lg" onClick={onEnter}>
          Open Library
        </Button>
      </div>
    </div>
  )
}

// ── Main onboarding container ──────────────────────────────────────────────────

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')

  const next = useCallback(() => {
    setStep((s) => {
      const idx = STEPS.indexOf(s)
      return STEPS[idx + 1] ?? s
    })
  }, [])

  const back = useCallback(() => {
    setStep((s) => {
      const idx = STEPS.indexOf(s)
      return idx > 0 ? (STEPS[idx - 1] ?? s) : s
    })
  }, [])

  return (
    <OnboardingCard step={step}>
      {step === 'welcome' && <StepWelcome onNext={next} />}
      {step === 'library' && <StepLibrary onNext={next} onBack={back} />}
      {step === 'ai' && <StepAI onNext={next} onBack={back} />}
      {step === 'privacy' && <StepPrivacy onNext={next} onBack={back} />}
      {step === 'done' && <StepDone onEnter={onComplete} onBack={back} />}
    </OnboardingCard>
  )
}
