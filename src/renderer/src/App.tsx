import { useState, useEffect, useCallback } from 'react'
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
import { GatherDock, useGather, useGatherDrops } from './screens/gather'

type AddFlow = 'approval' | null

/** The app window, once launch is fine and onboarding is done. */
function AppMain() {
  const [addFlow, setAddFlow] = useState<AddFlow>(null)
  /** The import batch on the Sort board, or null when it is closed. */
  const [sortBatch, setSortBatch] = useState<string | null>(null)

  const gather = useGather()
  const drops = useGatherDrops(gather)

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
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT, undefined)
      if (res.success) setSnapshot(res.data)
    })()
  }, [setSnapshot])

  // The launch stash check, once when the shell is first entered. Changes open the blocking stash
  // check modal on what was found; a check that fails points at Settings › My Stash.
  useEffect(() => {
    void (async () => {
      const res = await window.api
        .invoke(IPC_CHANNELS.INTEGRITY_REPORT, undefined)
        .catch(() => null)
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

  return (
    <>
      <AppShell
        showHeader={addFlow === null}
        onAddFiles={() => void gather.addFiles()}
        onAddFolder={() => void gather.addFolder()}
        copyWidget={<GatherDock gather={gather} />}
        dropOverlay={drops.overlay}
        dropHint={drops.hint}
      >
        {addFlow === null && (view === 'all' || view === 'starred') && (
          <LibraryPage
            starredOnly={view === 'starred'}
            onAddFiles={() => void gather.addFiles()}
            onAddFolder={() => void gather.addFolder()}
          />
        )}
        {addFlow === null && view === 'to-sort' && (
          <InboxPage
            key="to_sort"
            stage="to_sort"
            onSort={openSort}
            onAddFiles={() => void gather.addFiles()}
            onAddFolder={() => void gather.addFolder()}
          />
        )}
        {addFlow === null && view === 'to-stash' && (
          <InboxPage
            key="to_stash"
            stage="to_stash"
            onLookOver={openLookOver}
            onAddFiles={() => void gather.addFiles()}
            onAddFolder={() => void gather.addFolder()}
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
