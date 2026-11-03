import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { Button } from './components/Button'

// DEV-only: the ternary lets the production build drop the catalog chunk entirely.
const DesignSystemCatalog = import.meta.env.DEV
  ? lazy(() => import('./design-system/DesignSystemCatalog'))
  : () => null

interface SettingsSnapshot {
  path: string
  json: string
  exists: boolean
}

export default function DebugMenu() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)

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
    const tid = setTimeout(() => {
      void fetchSettings()
    }, 0)
    const id = setInterval(() => {
      void fetchSettings()
    }, 1500)
    return () => {
      clearTimeout(tid)
      clearInterval(id)
    }
  }, [open, fetchSettings])

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset ALL app state and relaunch?')) return
    await window.api.invoke(IPC_CHANNELS.DEBUG_RESET_APP, undefined)
  }, [])

  if (!import.meta.env.DEV) return null

  return (
    <>
      {catalogOpen && (
        <Suspense fallback={null}>
          <DesignSystemCatalog onClose={() => setCatalogOpen(false)} />
        </Suspense>
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {open && (
          <div className="flex w-80 flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-raised">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setCatalogOpen(true)
                setOpen(false)
              }}
            >
              Design system catalog
            </Button>
            <Button variant="destructive" className="w-full" onClick={() => void handleReset()}>
              Reset all app state
            </Button>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-xs text-muted-foreground">
                  {settings?.path ?? '—'}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-2 shrink-0"
                  onClick={() => void fetchSettings()}
                >
                  Refresh
                </Button>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-xs">
                {error !== null ? (
                  <span className="text-destructive">{error}</span>
                ) : settings === null ? (
                  <span className="text-foreground">Loading…</span>
                ) : settings.exists === false ? (
                  <span className="text-foreground">(no settings.json yet)</span>
                ) : (
                  <span className="text-foreground">{settings.json}</span>
                )}
              </pre>
            </div>
          </div>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full shadow-lifted"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close Debug' : '🐞 Debug'}
        </Button>
      </div>
    </>
  )
}
