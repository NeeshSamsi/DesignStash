// PLACEHOLDER UI — replace in design pass
import { useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'

interface TelemetryDisclosureProps {
  /** Called once the consent choice has been persisted (and onboarding marked complete). */
  onDecision: () => void
}

/**
 * First-run privacy disclosure (spec §13.3a). Telemetry is default-on and
 * pseudonymous, but the user must be told what is collected and given a real
 * opt-out before anything is sent. Setting consent also marks onboarding
 * complete in the main process (folded into TELEMETRY_SET_CONSENT).
 */
export default function TelemetryDisclosure({ onDecision }: TelemetryDisclosureProps) {
  const [busy, setBusy] = useState(false)

  const decide = async (enabled: boolean) => {
    setBusy(true)
    await window.api.invoke(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled })
    onDecision()
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-slate-100 flex flex-col items-center justify-center p-8 font-sans">
      <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-2xl p-8 border border-neutral-700">
        <h1 className="text-2xl font-bold text-white tracking-tight mb-4">
          Help improve DesignStash (optional)
        </h1>
        <p className="text-sm text-neutral-300 leading-relaxed mb-2">
          We collect anonymous usage data — which features you use, how long things take, your
          Mac&apos;s chip/memory tier, and crash reports. We <strong>never</strong> see your files,
          file names, images, or the titles/tags you create. There&apos;s no account and no personal
          info. You can turn this off now or anytime in Settings.
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => void decide(true)}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            Keep it on
          </button>
          <button
            onClick={() => void decide(false)}
            disabled={busy}
            className="bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-neutral-200 px-4 py-2 rounded-md font-medium transition-colors"
          >
            No thanks
          </button>
        </div>
      </div>
    </main>
  )
}
