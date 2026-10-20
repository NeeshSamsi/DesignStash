import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { ConsentPanel } from '../../components/ConsentPanel'

/** Settings › Privacy: the usage-data switch. Turning it off stops sending at once. */
export function PrivacyPane() {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    void window.api.invoke(IPC_CHANNELS.TELEMETRY_GET_CONSENT, undefined).then((res) => {
      setEnabled(res.success ? res.data.enabled : false)
    })
  }, [])

  const change = (next: boolean) => {
    setEnabled(next)
    void window.api.invoke(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled: next }).then((res) => {
      if (!res.success) setEnabled(!next)
    })
  }

  if (enabled === null) return null
  return <ConsentPanel mode="accordion" enabled={enabled} onEnabledChange={change} />
}
