import { useState, useEffect, useCallback } from 'react'
import type { ImportProgress } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxItem } from '@shared/inbox'
import { BootGate } from './screens/boot/BootGate'
import { stashCheckCopy } from './screens/integrity'
import LibraryPage from './screens/library/LibraryPage'
import InboxPage from './screens/inboxes/InboxPage'
import TrashPage from './screens/trash/TrashPage'
import { SortFlow } from './screens/sort'
import { LookOverFlow } from './screens/look-over'
import AppShell from './AppShell'
import DebugMenu from './DebugMenu'
import { useEntitlementStore } from './stores/entitlementStore'
import { useUiStore } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { toast } from './stores/toastStore'

type AddFlow = 'approval' | null

/** The app window, once launch is fine and onboarding is done. */
function AppMain() {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [isDropping, setIsDropping] = useState(false)
  const [addFlow, setAddFlow] = useState<AddFlow>(null)
  /** The import batch on the Sort board, or null when it is closed. */
  const [sortBatch, setSortBatch] = useState<string | null>(null)

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
      const res = await window.api.invoke(IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT, undefined)
      if (res.success) setSnapshot(res.data)
    })()
  }, [setSnapshot])

  // The launch stash check, once when the shell is first entered. Changes open the blocking stash
  // check modal on what was found; a check that fails points at Settings › My Stash.
  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_REPORT, undefined).catch(() => null)
      if (!res?.success) {
        toast({
          variant: 'error',
          message: stashCheckCopy.couldNotCheck.message,
          description: stashCheckCopy.couldNotCheck.description,
          action: {
            label: stashCheckCopy.couldNotCheck.action,
            onClick: () => useUiStore.getState().openSettings('my-stash')
          }
        })
        return
      }
      if (res.data.found.length > 0 || res.data.gone.length > 0) {
        openModal({ kind: 'reconcile', report: res.data })
      }
    })()
  }, [openModal])

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true)
    const [listRes, statsRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
        tagIds: libraryTagFilter.length ? libraryTagFilter : undefined,
        query: libraryQuery || undefined,
        sort: librarySort
      }),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    ])
    setLibraryLoading(false)
    if (listRes.success) setLibraryItems(listRes.data.items)
    if (statsRes.success) setLibraryStats(statsRes.data)
  }, [
    libraryQuery,
    librarySort,
    libraryTagFilter,
    setLibraryLoading,
    setLibraryItems,
    setLibraryStats
  ])

  const handleImport = useCallback(async (paths: string[]) => {
    setImportProgress(null)
    const result = await window.api.invoke(IPC_CHANNELS.IMPORT_START, { paths })
    if (result.success) {
      // Straight on to sorting what just arrived.
      setSortBatch(result.data.batchId)
    } else {
      console.error(result.error)
    }
  }, [])

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

  // The Sort board works on an import batch; Look it over works on the whole queue main holds, piles first.
  const batchOf = (items: InboxItem[]) =>
    items.find((item) => item.batchId !== null)?.batchId ?? null
  const openSort = (items: InboxItem[]) => {
    const batchId = batchOf(items)
    if (batchId === null)
      return toast({ variant: 'error', message: 'Couldn’t open these. Try again.' })
    setSortBatch(batchId)
  }
  const openLookOver = () => setAddFlow('approval')

  const handleLookOverClosed = async () => {
    setAddFlow(null)
    await refreshLibrary()
  }

  const importing = importProgress !== null && importProgress.phase !== 'done'
  const importCard = importing ? (
    <div className="w-72 rounded-xl border border-border bg-card p-4 shadow-xl">
      <p className="mb-1 text-sm font-medium capitalize text-foreground">{importProgress.phase}…</p>
      <p className="mb-2 truncate text-xs text-muted-foreground">{importProgress.currentTitle}</p>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{
            width: `${Math.round((importProgress.completed / importProgress.total) * 100)}%`
          }}
        />
      </div>
    </div>
  ) : undefined

  return (
    <>
      <AppShell
        showHeader={addFlow === null}
        importing={importing}
        importCard={importCard}
        onAddFiles={() => void handleFileSelect()}
        onAddFolder={() => void handleFolderSelect()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        isDropping={isDropping}
      >
        {addFlow === null && (view === 'all' || view === 'starred') && (
          <LibraryPage
            starredOnly={view === 'starred'}
            onAddFiles={() => void handleFileSelect()}
            onAddFolder={() => void handleFolderSelect()}
          />
        )}
        {addFlow === null && view === 'to-sort' && (
          <InboxPage
            key="to_sort"
            stage="to_sort"
            onSort={openSort}
            onAddFiles={() => void handleFileSelect()}
            onAddFolder={() => void handleFolderSelect()}
          />
        )}
        {addFlow === null && view === 'to-stash' && (
          <InboxPage
            key="to_stash"
            stage="to_stash"
            onLookOver={openLookOver}
            onAddFiles={() => void handleFileSelect()}
            onAddFolder={() => void handleFolderSelect()}
          />
        )}
        {addFlow === null && view === 'trash' && <TrashPage />}
      </AppShell>
      <SortFlow
        open={sortBatch !== null}
        batchId={sortBatch}
        onClose={() => setSortBatch(null)}
        onLookThemOver={openLookOver}
      />
      <LookOverFlow
        open={addFlow === 'approval'}
        onClose={() => void handleLookOverClosed()}
        onBackToSort={() => setAddFlow(null)}
      />
    </>
  )
}

export default function App() {
  return (
    <>
      <BootGate>
        <AppMain />
      </BootGate>
      <DebugMenu />
    </>
  )
}
