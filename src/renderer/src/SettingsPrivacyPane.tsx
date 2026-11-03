// PLACEHOLDER UI — replace in design pass
import { useState, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'

/**
 * Privacy pane — live opt-in/opt-out for anonymous usage data (spec §13.3).
 * Reflects current consent via TELEMETRY_GET_CONSENT and updates it through
 * TELEMETRY_SET_CONSENT (which rebuilds the main-process telemetry instance).
 */
export default function SettingsPrivacyPane() {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.TELEMETRY_GET_CONSENT, undefined)
      if (res.success) setEnabled(res.data.enabled)
    })()
  }, [])

  const handleToggle = async (next: boolean) => {
    setEnabled(next)
    const res = await window.api.invoke(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled: next })
    if (res.success) setEnabled(res.data.enabled)
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Privacy</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Anonymous usage data helps improve DesignStash. We never collect your files, file names,
        images, or the titles and tags you create.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null}
          onChange={(e) => void handleToggle(e.target.checked)}
          className="accent-primary"
        />
        Share anonymous usage data
      </label>
    </div>
  )
}
