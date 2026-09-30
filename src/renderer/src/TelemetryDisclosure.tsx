import { useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { Button } from './ui/button'

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8 font-sans text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-2xl">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
          Help improve DesignStash (optional)
        </h1>
        <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
          We collect anonymous usage data — which features you use, how long things take, your
          Mac&apos;s chip/memory tier, and crash reports. We <strong>never</strong> see your files,
          file names, images, or the titles/tags you create. There&apos;s no account and no personal
          info. You can turn this off now or anytime in Settings.
        </p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => void decide(true)} disabled={busy}>
            Keep it on
          </Button>
          <Button variant="secondary" onClick={() => void decide(false)} disabled={busy}>
            No thanks
          </Button>
        </div>
      </div>
    </main>
  )
}
