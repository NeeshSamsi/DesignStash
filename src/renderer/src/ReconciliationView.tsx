// MOCK UI — deliberately raw; exercises every M9 integrity channel
import { useCallback, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { IntegrityReport } from '@shared/integrity'

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

  const btn = 'text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-2 py-1 rounded transition-colors'

  return (
    <main className="min-h-screen bg-neutral-900 text-slate-100 p-8 font-sans">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Library Reconciliation (mock)</h1>
        <div className="flex gap-2">
          <button onClick={() => void scan()} className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors">
            {scanning ? 'Checking…' : 'Check library'}
          </button>
          <button onClick={onBack} className={btn}>Back</button>
        </div>
      </div>

      {status && <p className="text-xs text-blue-400 mb-3 font-mono">{status}</p>}

      {report && (
        <p className="text-sm text-neutral-400 mb-6">
          {report.orphanFiles.length} file(s) found that aren&apos;t in your library; {report.orphanRecords.length}{' '}
          library item(s) missing their file.
        </p>
      )}

      {report && (
        <div className="grid grid-cols-2 gap-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">Orphan files ({report.orphanFiles.length})</h2>
              {report.orphanFiles.length > 0 && (
                <button onClick={() => void addAll()} className={btn}>Add all</button>
              )}
            </div>
            <ul className="space-y-1">
              {report.orphanFiles.map((f) => (
                <li key={f} className="flex items-center justify-between gap-2 bg-neutral-800 rounded p-2">
                  <span className="text-xs text-neutral-300 font-mono truncate">{f}</span>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => void addOrphan(f)} className={btn}>Add</button>
                    <button onClick={() => ignoreFile(f)} className={btn}>Ignore</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">Orphan records ({report.orphanRecords.length})</h2>
              {report.orphanRecords.length > 0 && (
                <button onClick={() => void deleteAll()} className={btn}>Delete all</button>
              )}
            </div>
            <ul className="space-y-1">
              {report.orphanRecords.map((r) => (
                <li key={r.mockupId} className="flex items-center justify-between gap-2 bg-neutral-800 rounded p-2">
                  <span className="text-xs text-neutral-300 font-mono truncate">
                    #{r.mockupId} · {r.libraryPath}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => void deleteRecord(r.mockupId)} className={btn}>Delete entry</button>
                    <button onClick={() => ignoreRecord(r.mockupId)} className={btn}>Ignore</button>
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
