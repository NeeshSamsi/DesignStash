// Exercises every M9 integrity channel
import { useCallback, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { IntegrityReport } from '@shared/integrity'
import { Button } from './ui/button'

interface Props {
  onBack: () => void
}

export default function ReconciliationView({ onBack }: Props) {
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [status, setStatus] = useState('')
  const [scanning, setScanning] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_SCAN, undefined)
    setScanning(false)
    if (res.success) setReport(res.data)
    else setStatus(`Scan error: ${res.error.message}`)
  }, [])

  const addOrphan = useCallback(
    async (filePath: string) => {
      const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, { filePath })
      setStatus(res.success ? `Added ${filePath} → mockup ${res.data.mockupId}` : `Error: ${res.error.message}`)
      await scan()
    },
    [scan]
  )

  const deleteRecord = useCallback(
    async (mockupId: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, { mockupId })
      setStatus(res.success ? `Deleted entry ${mockupId}` : `Error: ${res.error.message}`)
      await scan()
    },
    [scan]
  )

  const ignoreFile = useCallback((filePath: string) => {
    setReport((prev) => (prev ? { ...prev, orphanFiles: prev.orphanFiles.filter((f) => f !== filePath) } : prev))
  }, [])

  const ignoreRecord = useCallback((mockupId: number) => {
    setReport((prev) =>
      prev ? { ...prev, orphanRecords: prev.orphanRecords.filter((r) => r.mockupId !== mockupId) } : prev
    )
  }, [])

  const addAll = useCallback(async () => {
    if (!report) return
    for (const f of report.orphanFiles) {
      await window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, { filePath: f })
    }
    await scan()
  }, [report, scan])

  const deleteAll = useCallback(async () => {
    if (!report) return
    for (const r of report.orphanRecords) {
      await window.api.invoke(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, { mockupId: r.mockupId })
    }
    await scan()
  }, [report, scan])

  return (
    <main className="min-h-screen bg-background p-8 font-sans text-foreground">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Library Reconciliation (mock)</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void scan()}>
            {scanning ? 'Checking…' : 'Check library'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>

      {status && <p className="mb-3 font-mono text-xs text-primary">{status}</p>}

      {report && (
        <p className="mb-6 text-sm text-muted-foreground">
          {report.orphanFiles.length} file(s) found that aren&apos;t in your library; {report.orphanRecords.length}{' '}
          library item(s) missing their file.
        </p>
      )}

      {report && (
        <div className="grid grid-cols-2 gap-6">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Orphan files ({report.orphanFiles.length})</h2>
              {report.orphanFiles.length > 0 && (
                <Button variant="secondary" size="xs" onClick={() => void addAll()}>Add all</Button>
              )}
            </div>
            <ul className="space-y-1">
              {report.orphanFiles.map((f) => (
                <li key={f} className="flex items-center justify-between gap-2 rounded bg-card p-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">{f}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="secondary" size="xs" onClick={() => void addOrphan(f)}>Add</Button>
                    <Button variant="ghost" size="xs" onClick={() => ignoreFile(f)}>Ignore</Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Orphan records ({report.orphanRecords.length})</h2>
              {report.orphanRecords.length > 0 && (
                <Button variant="secondary" size="xs" onClick={() => void deleteAll()}>Delete all</Button>
              )}
            </div>
            <ul className="space-y-1">
              {report.orphanRecords.map((r) => (
                <li key={r.mockupId} className="flex items-center justify-between gap-2 rounded bg-card p-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    #{r.mockupId} · {r.libraryPath}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="secondary" size="xs" onClick={() => void deleteRecord(r.mockupId)}>Delete entry</Button>
                    <Button variant="ghost" size="xs" onClick={() => ignoreRecord(r.mockupId)}>Ignore</Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  )
}
