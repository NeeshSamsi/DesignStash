import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiModelInfo, AiDownloadProgress } from '@shared/ipc'

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
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-8 font-sans">
      <div className="max-w-lg w-full bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700 p-8">
        <div className="flex justify-center gap-1.5 mb-6" aria-label="Step progress">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i <= idx ? 'bg-brand-500' : 'bg-neutral-600'
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
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Welcome to DesignStash</h1>
      <p className="text-sm text-neutral-400 leading-relaxed mb-6">
        Your local-first library for organising and searching mockups. Your files stay on your Mac
        — no cloud, no account.
      </p>
      <button
        onClick={onNext}
        className="bg-brand-500 hover:bg-brand-500/80 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
      >
        Get Started
      </button>
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
      <h2 className="text-xl font-bold text-slate-100 mb-2">Choose your library location</h2>
      <p className="text-sm text-neutral-400 leading-relaxed mb-4">
        DesignStash manages its own folder — your PSD files are copied in and the app handles
        everything from there. You won&apos;t need to browse to it in Finder.
      </p>
      <div className="bg-neutral-900/50 border border-neutral-700 rounded-lg px-4 py-3 mb-4">
        <p className="text-xs text-neutral-500 mb-0.5">Library location</p>
        <p className="text-sm text-slate-200 font-mono truncate">
          {libraryPath ?? '~/Library/Application Support/DesignStash'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm px-4 py-2 rounded-lg text-neutral-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => void handleChooseFolder()}
          disabled={busy}
          className="text-sm px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-slate-200 disabled:opacity-50 transition-colors"
        >
          Choose a different folder…
        </button>
        <button
          onClick={onNext}
          className="text-sm px-6 py-2 rounded-lg bg-brand-500 hover:bg-brand-500/80 text-white font-medium transition-colors"
        >
          Continue
        </button>
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
      <h2 className="text-xl font-bold text-slate-100 mb-2">On-device AI tagging</h2>
      <p className="text-sm text-neutral-400 leading-relaxed mb-4">
        A small model runs entirely on your Mac — no internet needed after download. It
        auto-generates titles, descriptions, and tags for imported mockups.
      </p>

      {hardware && (
        <p className="text-xs text-neutral-500 mb-4">
          {hardware.chip} · {hardware.totalMemoryGB.toFixed(0)} GB RAM ·{' '}
          <span className="text-brand-500">Recommended: {hardware.recommendedTier}</span>
        </p>
      )}

      {/* Enable / Skip toggle */}
      {aiMode === 'choose' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setEnableAI(true)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
              enableAI
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'bg-neutral-700 border-neutral-600 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            Enable AI (recommended)
          </button>
          <button
            onClick={() => setEnableAI(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
              !enableAI
                ? 'bg-neutral-600 border-neutral-500 text-slate-100'
                : 'bg-neutral-700 border-neutral-600 text-neutral-400 hover:bg-neutral-600'
            }`}
          >
            Skip for now
          </button>
        </div>
      )}

      {/* Model list (only when enabling) */}
      {aiMode === 'choose' && enableAI && (
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {models.map((model) => {
            const isRecommended = hardware?.recommendedTier === model.tier
            const isSelected = selected === model.id
            return (
              <button
                key={model.id}
                onClick={() => setSelected(model.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-neutral-600 bg-neutral-700/50 hover:bg-neutral-700'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                    isSelected ? 'border-brand-500 bg-brand-500' : 'border-neutral-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{model.name}</span>
                    {isRecommended && (
                      <span className="text-xs bg-brand-500/20 text-brand-500 px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                    {model.installed && (
                      <span className="text-xs bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded">
                        Downloaded
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
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
          <p className="text-sm text-slate-200 mb-2">
            {downloadProgress?.phase === 'verifying' ? 'Verifying model…' : `Downloading… ${pct}%`}
          </p>
          <div className="w-full bg-neutral-700 rounded-full h-2 mb-3">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <button
            onClick={() => void handleCancel()}
            className="text-sm text-neutral-400 hover:text-red-400 transition-colors"
          >
            Cancel download
          </button>
        </div>
      )}

      {/* Download complete */}
      {downloadDone && (
        <div className="mb-4 flex items-center gap-2 text-green-400 text-sm">
          <span>✓</span>
          <span>Model downloaded and ready</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={onBack}
          disabled={aiMode === 'downloading' && !downloadDone}
          className="text-sm px-4 py-2 rounded-lg text-neutral-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
        >
          ← Back
        </button>
        {aiMode === 'choose' && enableAI && (
          <button
            onClick={() => void handleDownload()}
            disabled={!selected}
            className="px-6 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-500/80 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            Download &amp; Enable
          </button>
        )}
        {aiMode === 'choose' && !enableAI && (
          <button
            onClick={onNext}
            className="px-6 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-slate-200 text-sm font-medium transition-colors"
          >
            Skip — use manual tagging
          </button>
        )}
        {aiMode === 'downloading' && downloadDone && (
          <button
            onClick={() => void handleContinue()}
            className="px-6 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-500/80 text-white text-sm font-medium transition-colors"
          >
            Continue
          </button>
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
      <h2 className="text-xl font-bold text-slate-100 mb-2">
        Help improve DesignStash (optional)
      </h2>
      <p className="text-sm text-neutral-400 leading-relaxed mb-2">
        We collect anonymous usage data — which features you use, how long things take, your
        Mac&apos;s chip/memory tier, and crash reports. We{' '}
        <strong className="text-slate-300">never</strong> see your files, file names, images, or
        the titles/tags you create. There&apos;s no account and no personal info. You can turn this
        off anytime in Settings.
      </p>
      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          disabled={busy}
          className="text-sm px-4 py-2.5 rounded-lg text-neutral-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => void decide(true)}
          disabled={busy}
          className="bg-brand-500 hover:bg-brand-500/80 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          Keep it on
        </button>
        <button
          onClick={() => void decide(false)}
          disabled={busy}
          className="bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-neutral-200 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          No thanks
        </button>
      </div>
    </div>
  )
}

// ── Step 5: Done ───────────────────────────────────────────────────────────────

function StepDone({ onEnter, onBack }: { onEnter: () => void; onBack: () => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-100 mb-2">You&apos;re all set!</h2>
      <p className="text-sm text-neutral-400 leading-relaxed mb-6">
        Your library is ready. Import your first mockups using the{' '}
        <strong className="text-slate-300">+ Files</strong> or{' '}
        <strong className="text-slate-300">+ Folder</strong> buttons in the sidebar.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm px-4 py-2.5 rounded-lg text-neutral-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onEnter}
          className="bg-brand-500 hover:bg-brand-500/80 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          Open Library
        </button>
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
