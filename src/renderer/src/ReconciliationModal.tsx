import { useState, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { IntegrityReport } from '@shared/integrity'
import { Modal } from './ui/Modal'

interface Props {
  report: IntegrityReport
  onClose: () => void
}

const btn =
  'text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-2 py-1 rounded transition-colors'

export function ReconciliationModal({ report: initialReport, onClose }: Props) {
  const [localReport, setLocalReport] = useState<IntegrityReport>(initialReport)
  const [scanning, setScanning] = useState(false)

  const rescan = useCallback(async () => {
    setScanning(true)
    const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_SCAN, undefined)
    setScanning(false)
    if (res.success) {
      const fresh = res.data
      if (fresh.orphanFiles.length === 0 && fresh.orphanRecords.length === 0) {
        onClose()
      } else {
        setLocalReport(fresh)
      }
    }
  }, [onClose])

  const handleAddOrphan = async (filePath: string) => {
    await window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, { filePath })
    await rescan()
  }

  const handleDeleteRecord = async (mockupId: number) => {
    await window.api.invoke(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, { mockupId })
    await rescan()
  }

  const handleIgnoreFile = (filePath: string) => {
    const next: IntegrityReport = {
      ...localReport,
      orphanFiles: localReport.orphanFiles.filter((f) => f !== filePath),
    }
    if (next.orphanFiles.length === 0 && next.orphanRecords.length === 0) {
      onClose()
    } else {
      setLocalReport(next)
    }
  }

  const handleIgnoreRecord = (mockupId: number) => {
    const next: IntegrityReport = {
      ...localReport,
      orphanRecords: localReport.orphanRecords.filter((r) => r.mockupId !== mockupId),
    }
    if (next.orphanFiles.length === 0 && next.orphanRecords.length === 0) {
      onClose()
    } else {
      setLocalReport(next)
    }
  }

  const handleAddAll = async () => {
    for (const f of localReport.orphanFiles) {
      await window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, { filePath: f })
    }
    await rescan()
  }

  const handleDeleteAll = async () => {
    for (const r of localReport.orphanRecords) {
      await window.api.invoke(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, { mockupId: r.mockupId })
    }
    await rescan()
  }

  const totalRemaining = localReport.orphanFiles.length + localReport.orphanRecords.length

  return (
    <Modal blocking className="max-w-2xl">
      <div className="px-6 py-5 border-b border-neutral-700">
        <h2 className="text-base font-semibold text-white">Library out of sync</h2>
        <p className="text-sm text-neutral-400 mt-1">
          {localReport.orphanFiles.length} file{localReport.orphanFiles.length !== 1 ? 's' : ''} found
          outside your library
          {localReport.orphanRecords.length > 0 &&
            ` · ${localReport.orphanRecords.length} item${localReport.orphanRecords.length !== 1 ? 's' : ''} missing their file`}
          . Resolve all items to continue.
        </p>
      </div>

      <div className="p-6 grid grid-cols-2 gap-6 max-h-96 overflow-auto">
        {/* Orphan files */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Untracked files ({localReport.orphanFiles.length})
            </h3>
            {localReport.orphanFiles.length > 1 && (
              <button onClick={() => void handleAddAll()} className={btn}>
                Add all
              </button>
            )}
          </div>
          {localReport.orphanFiles.length === 0 ? (
            <p className="text-xs text-neutral-500">None</p>
          ) : (
            <ul className="space-y-1">
              {localReport.orphanFiles.map((f) => (
                <li
                  key={f}
                  className="flex items-center justify-between gap-2 bg-neutral-700/50 rounded p-2"
                >
                  <span className="text-xs text-neutral-300 font-mono truncate flex-1">{f}</span>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => void handleAddOrphan(f)} className={btn}>
                      Add
                    </button>
                    <button onClick={() => handleIgnoreFile(f)} className={btn}>
                      Ignore
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Orphan records */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Missing files ({localReport.orphanRecords.length})
            </h3>
            {localReport.orphanRecords.length > 1 && (
              <button onClick={() => void handleDeleteAll()} className={btn}>
                Delete all
              </button>
            )}
          </div>
          {localReport.orphanRecords.length === 0 ? (
            <p className="text-xs text-neutral-500">None</p>
          ) : (
            <ul className="space-y-1">
              {localReport.orphanRecords.map((r) => (
                <li
                  key={r.mockupId}
                  className="flex items-center justify-between gap-2 bg-neutral-700/50 rounded p-2"
                >
                  <span className="text-xs text-neutral-300 font-mono truncate flex-1">
                    #{r.mockupId} · {r.libraryPath}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => void handleDeleteRecord(r.mockupId)} className={btn}>
                      Delete entry
                    </button>
                    <button onClick={() => handleIgnoreRecord(r.mockupId)} className={btn}>
                      Ignore
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="px-6 py-4 border-t border-neutral-700 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {scanning ? 'Scanning…' : `${totalRemaining} item${totalRemaining !== 1 ? 's' : ''} remaining`}
        </p>
        <button
          disabled={totalRemaining > 0}
          onClick={onClose}
          className="text-xs bg-brand-500 hover:bg-brand-500/80 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
