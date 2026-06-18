import { useState, useEffect, useCallback } from 'react'
import type { ImportProgress, ImportSummary } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import Onboarding from './onboarding/Onboarding'
import GroupingReview from './GroupingReview'
import ApprovalStepper from './ApprovalStepper'
import LibraryView from './LibraryView'
import LibraryTopBar from './LibraryTopBar'
import TrashView from './TrashView'
import SettingsPage from './SettingsPage'
import AppShell from './AppShell'
import DebugMenu from './DebugMenu'
import { useGroupingStore } from './stores/groupingStore'
import { useApprovalStore } from './stores/approvalStore'
import { useEntitlementStore } from './stores/entitlementStore'
import { useUiStore } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'

type AddFlow = 'grouping' | 'approval' | null

export default function App() {
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [isDropping, setIsDropping] = useState(false)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [addFlow, setAddFlow] = useState<AddFlow>(null)

  const groupingStore = useGroupingStore()
  const approvalStore = useApprovalStore()
  const setSnapshot = useEntitlementStore((s) => s.setSnapshot)
  const view = useUiStore((s) => s.view)
  const openModal = useUiStore((s) => s.openModal)
  const libraryQuery = useLibraryStore((s) => s.query)
  const librarySort = useLibraryStore((s) => s.sort)
  const libraryTagFilter = useLibraryStore((s) => s.tagFilter)
  const setLibraryItems = useLibraryStore((s) => s.setItems)
  const setLibraryStats = useLibraryStore((s) => s.setStats)
  const setLibraryLoading = useLibraryStore((s) => s.setLoading)

  useEffect(() => {
    const unsubscribe = window.api.onImportProgress(setImportProgress)
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET, undefined)
      setOnboarded(res.success ? res.data.onboarded : true)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT, undefined)
      if (res.success) setSnapshot(res.data)
    })()
  }, [setSnapshot])

  // Boot integrity scan — runs once when the shell is first entered.
  useEffect(() => {
    if (onboarded !== true) return
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_SCAN, undefined)
      if (res.success) {
        const report = res.data
        if (report.orphanFiles.length > 0 || report.orphanRecords.length > 0) {
          openModal({ kind: 'reconcile', report })
        }
      }
    })()
  }, [onboarded, openModal])

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true)
    const [listRes, statsRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
        tagIds: libraryTagFilter.length ? libraryTagFilter : undefined,
        query: libraryQuery || undefined,
        sort: librarySort,
      }),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined),
    ])
    setLibraryLoading(false)
    if (listRes.success) setLibraryItems(listRes.data.items)
    if (statsRes.success) setLibraryStats(statsRes.data)
  }, [libraryQuery, librarySort, libraryTagFilter, setLibraryLoading, setLibraryItems, setLibraryStats])

  const handleImport = useCallback(
    async (paths: string[]) => {
      setImportSummary(null)
      setImportProgress(null)
      const result = await window.api.invoke(IPC_CHANNELS.IMPORT_START, { paths })
      if (result.success) {
        const summary = result.data
        setImportSummary(summary)
        groupingStore.setLoading(true)
        const proposeRes = await window.api.invoke(IPC_CHANNELS.GROUPING_PROPOSE, {
          batchId: summary.batchId,
        })
        groupingStore.setLoading(false)
        if (proposeRes.success) {
          groupingStore.setProposal(proposeRes.data)
          setAddFlow('grouping')
        }
      } else {
        console.error(result.error)
      }
    },
    [groupingStore]
  )

  const handleFileSelect = useCallback(async () => {
    const result = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, undefined)
    if (result.success && result.data.paths.length > 0) {
      void handleImport(result.data.paths)
    }
  }, [handleImport])

  const handleFolderSelect = useCallback(async () => {
    const result = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (result.success && result.data.path) {
      void handleImport([result.data.path])
    }
  }, [handleImport])

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDropping(false)
      const files = Array.from(event.dataTransfer.files)
      if (files.length > 0) {
        const paths = files.map((file) => window.api.getPathForFile(file))
        void handleImport(paths)
      }
    },
    [handleImport]
  )

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropping(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropping(false)
  }

  if (onboarded === null) {
    return (
      <>
        <div className="min-h-screen bg-neutral-900" />
        <DebugMenu />
      </>
    )
  }

  if (!onboarded) {
    return (
      <>
        <Onboarding onComplete={() => setOnboarded(true)} />
        <DebugMenu />
      </>
    )
  }

  const handleGroupingConfirm = async () => {
    const batchId = importSummary?.batchId
    if (!batchId) { setAddFlow(null); return }
    approvalStore.setInitializing(true)
    const res = await window.api.invoke(IPC_CHANNELS.APPROVAL_INIT, { batchId })
    approvalStore.setInitializing(false)
    if (res.success) {
      approvalStore.setQueue(res.data)
      groupingStore.reset()
      setAddFlow('approval')
    }
  }

  const handlePipelineCancel = () => {
    setAddFlow(null)
    groupingStore.reset()
    approvalStore.reset()
  }

  const handleApprovalComplete = async () => {
    setAddFlow(null)
    approvalStore.reset()
    await refreshLibrary()
  }

  return (
    <>
      <AppShell
        topBar={view === 'library' && addFlow === null ? <LibraryTopBar /> : undefined}
        onAddFiles={() => void handleFileSelect()}
        onAddFolder={() => void handleFolderSelect()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        isDropping={isDropping}
      >
        {addFlow === 'grouping' && (
          <GroupingReview
            onConfirm={() => void handleGroupingConfirm()}
            onCancel={handlePipelineCancel}
          />
        )}
        {addFlow === 'approval' && (
          <ApprovalStepper
            onComplete={() => void handleApprovalComplete()}
            onCancel={handlePipelineCancel}
          />
        )}
        {addFlow === null && view === 'library' && <LibraryView />}
        {addFlow === null && view === 'trash' && <TrashView />}
        {addFlow === null && view === 'settings' && <SettingsPage />}
        {importProgress && importProgress.phase !== 'done' && (
          <div className="fixed bottom-6 right-6 z-40 bg-neutral-800 border border-neutral-600 rounded-xl p-4 shadow-xl w-72">
            <p className="text-sm font-medium text-slate-100 mb-1 capitalize">{importProgress.phase}…</p>
            <p className="text-xs text-neutral-400 mb-2 truncate">{importProgress.currentTitle}</p>
            <div className="w-full bg-neutral-700 rounded-full h-1.5">
              <div
                className="bg-brand-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round((importProgress.completed / importProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </AppShell>
      <DebugMenu />
    </>
  )
}
