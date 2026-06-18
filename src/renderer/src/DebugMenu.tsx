import { useState, useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'

interface SettingsSnapshot {
  path: string
  json: string
  exists: boolean
}

export default function DebugMenu() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await window.api.invoke(IPC_CHANNELS.DEBUG_READ_SETTINGS, undefined)
      if (res.success) {
        setSettings(res.data)
        setError(null)
      } else {
        setError(res.error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const tid = setTimeout(() => { void fetchSettings() }, 0)
    const id = setInterval(() => { void fetchSettings() }, 1500)
    return () => { clearTimeout(tid); clearInterval(id) }
  }, [open, fetchSettings])

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset ALL app state and relaunch?')) return
    await window.api.invoke(IPC_CHANNELS.DEBUG_RESET_APP, undefined)
  }, [])

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-neutral-800 border border-neutral-600 rounded-xl p-4 shadow-xl w-80 flex flex-col gap-3">
          <button
            onClick={() => void handleReset()}
            className="w-full bg-red-700 hover:bg-red-600 text-slate-100 text-sm font-medium rounded-lg py-2 transition-colors"
          >
            Reset all app state
          </button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 truncate">{settings?.path ?? '—'}</span>
              <button
                onClick={() => void fetchSettings()}
                className="text-xs text-neutral-400 hover:text-slate-100 ml-2 shrink-0 transition-colors"
              >
                Refresh
              </button>
            </div>
            <pre className="bg-neutral-900 rounded-lg p-2 text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all">
              {error !== null ? (
                <span className="text-red-400">{error}</span>
              ) : settings === null ? (
                <span className="text-slate-100">Loading…</span>
              ) : settings.exists === false ? (
                <span className="text-slate-100">(no settings.json yet)</span>
              ) : (
                <span className="text-slate-100">{settings.json}</span>
              )}
            </pre>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-neutral-800 border border-neutral-600 text-slate-100 text-xs font-medium rounded-full px-3 py-1.5 shadow-lg hover:bg-neutral-700 transition-colors"
      >
        {open ? 'Close Debug' : '🐞 Debug'}
      </button>
    </div>
  )
}
