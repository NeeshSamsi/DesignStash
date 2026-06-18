import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReconciliationModal } from './ReconciliationModal'
import { IPC_CHANNELS } from '@shared/ipc'
import type { IntegrityReport } from '@shared/integrity'

const driftReport: IntegrityReport = {
  orphanFiles: ['/stash/orphan.psd'],
  orphanRecords: [{ mockupId: 5, libraryPath: '/stash/missing.psd' }],
}

const cleanReport: IntegrityReport = { orphanFiles: [], orphanRecords: [] }

function setupApi(scanResult: IntegrityReport = cleanReport) {
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.INTEGRITY_SCAN)
        return { success: true, data: scanResult }
      if (channel === IPC_CHANNELS.INTEGRITY_ADD_ORPHAN)
        return { success: true, data: { mockupId: 99 } }
      if (channel === IPC_CHANNELS.INTEGRITY_DELETE_RECORD)
        return { success: true, data: { deleted: true } }
      return { success: true, data: {} }
    }),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn(),
  } as unknown as typeof window.api
}

beforeEach(() => {
  setupApi()
})

describe('ReconciliationModal', () => {
  it('renders orphan file and orphan record from the report', () => {
    render(<ReconciliationModal report={driftReport} onClose={() => {}} />)
    expect(screen.getByText('/stash/orphan.psd')).toBeTruthy()
    expect(screen.getByText(/#5/)).toBeTruthy()
  })

  it('Ignore file removes it from the list and closes when last item ignored', () => {
    const onClose = vi.fn()
    const singleFile: IntegrityReport = { orphanFiles: ['/a.psd'], orphanRecords: [] }
    render(<ReconciliationModal report={singleFile} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Add button calls INTEGRITY_ADD_ORPHAN; when rescan returns clean report modal closes', async () => {
    const onClose = vi.fn()
    const singleFile: IntegrityReport = { orphanFiles: ['/a.psd'], orphanRecords: [] }
    setupApi(cleanReport)
    render(<ReconciliationModal report={singleFile} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, {
        filePath: '/a.psd',
      })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('Delete entry calls INTEGRITY_DELETE_RECORD; clean rescan closes modal', async () => {
    const onClose = vi.fn()
    const singleRecord: IntegrityReport = {
      orphanFiles: [],
      orphanRecords: [{ mockupId: 5, libraryPath: '/stash/missing.psd' }],
    }
    setupApi(cleanReport)
    render(<ReconciliationModal report={singleRecord} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }))
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, {
        mockupId: 5,
      })
    })
    expect(onClose).toHaveBeenCalled()
  })
})
