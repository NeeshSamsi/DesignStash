import { useState, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { IntegrityReport } from '@shared/integrity'
import { Modal } from './components/_legacy/Modal'
import { Button } from './ui/button'

interface Props {
  report: IntegrityReport
  onClose: () => void
}

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
    <Modal blocking className="sm:max-w-2xl" label="Library reconciliation">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-base font-semibold text-foreground">Library out of sync</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {localReport.orphanFiles.length} file{localReport.orphanFiles.length !== 1 ? 's' : ''} found
          outside your library
          {localReport.orphanRecords.length > 0 &&
            ` · ${localReport.orphanRecords.length} item${localReport.orphanRecords.length !== 1 ? 's' : ''} missing their file`}
          . Resolve all items to continue.
        </p>
      </div>

      <div className="grid max-h-96 grid-cols-2 gap-6 overflow-auto p-6">
        {/* Orphan files */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Untracked files ({localReport.orphanFiles.length})
            </h3>
            {localReport.orphanFiles.length > 1 && (
              <Button variant="secondary" size="xs" onClick={() => void handleAddAll()}>
                Add all
              </Button>
            )}
          </div>
          {localReport.orphanFiles.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {localReport.orphanFiles.map((f) => (
                <li
                  key={f}
                  className="flex items-center justify-between gap-2 rounded bg-muted/50 p-2"
                >
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{f}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="secondary" size="xs" onClick={() => void handleAddOrphan(f)}>
                      Add
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => handleIgnoreFile(f)}>
                      Ignore
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Orphan records */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Missing files ({localReport.orphanRecords.length})
            </h3>
            {localReport.orphanRecords.length > 1 && (
              <Button variant="secondary" size="xs" onClick={() => void handleDeleteAll()}>
                Delete all
              </Button>
            )}
          </div>
          {localReport.orphanRecords.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {localReport.orphanRecords.map((r) => (
                <li
                  key={r.mockupId}
                  className="flex items-center justify-between gap-2 rounded bg-muted/50 p-2"
                >
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    #{r.mockupId} · {r.libraryPath}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="secondary" size="xs" onClick={() => void handleDeleteRecord(r.mockupId)}>
                      Delete entry
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => handleIgnoreRecord(r.mockupId)}>
                      Ignore
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">
          {scanning ? 'Scanning…' : `${totalRemaining} item${totalRemaining !== 1 ? 's' : ''} remaining`}
        </p>
        <Button size="sm" disabled={totalRemaining > 0} onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}
