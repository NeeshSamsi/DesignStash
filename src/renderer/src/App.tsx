import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { BootGate } from './screens/boot/BootGate'
import { stashCheckCopy } from './screens/integrity'
import LibraryPage from './screens/library/LibraryPage'
import InboxPage from './screens/inboxes/InboxPage'
import TrashPage from './screens/trash/TrashPage'
import { SortFlow, type SortScope } from './screens/sort'
import { LookOverFlow, type LookOverScope } from './screens/look-over'
import AppShell from './AppShell'
import DebugMenu from './DebugMenu'
import { useUiStore } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { useDetailEffects } from './stores/detailEffectsStore'
import { subscribePush } from './lib/subscribe'
import { toast } from './stores/toastStore'
import { useUpdateNotice } from './lib/update-notice'
import { useActiveModelNotice } from './lib/model-notice'
import { GatherDock, useGather, useGatherDrops } from './screens/gather'

/** The app window, once launch is fine and onboarding is done. */
function AppMain() {
  /** What Look it over is open on, or null when it is closed. */
  const [lookOver, setLookOver] = useState<LookOverScope | null>(null)
  const addFlow = lookOver === null ? null : 'approval'
  /** What the Sort board is open on, or null when it is closed. */
  const [sorting, setSorting] = useState<SortScope | null>(null)

  const gather = useGather()
  const drops = useGatherDrops(gather)
  // A haul running or paused still has files to come, which the Sort board won't show (S1.E1).
  const haulOpen = gather.haul?.state === 'running' || gather.haul?.state === 'paused'

  const view = useUiStore((s) => s.view)
  const openModal = useUiStore((s) => s.openModal)
  const setLibraryStats = useLibraryStore((s) => s.setStats)

  useUpdateNotice()
  useActiveModelNotice()

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

  // Something in the stash folder changed outside the app (a cover deleted in Finder): every
  // library view reads again, so the card shows the cover as missing (F-012).
  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.LIBRARY_CHANGED, () => useDetailEffects.getState().notifyChanged()),
    []
  )

  // My Stash fetches its own list, with its view and filters, whenever it shows: only the counts
  // are refreshed here.
  const refreshLibrary = useCallback(async () => {
    const statsRes = await window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    if (statsRes.success) setLibraryStats(statsRes.data)
  }, [setLibraryStats])

  // Sort and Look it over each open on everything waiting, or on just the cards picked.
  const openSort = (scope: SortScope = { kind: 'all' }) => setSorting(scope)
  const openLookOver = (scope: LookOverScope = { kind: 'all' }) => setLookOver(scope)

  const handleLookOverClosed = async () => {
    setLookOver(null)
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
            onSortWaiting={() => openSort()}
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
        open={sorting !== null}
        {...(sorting ? { scope: sorting } : {})}
        copying={haulOpen}
        onClose={() => setSorting(null)}
        onLookThemOver={() => openLookOver()}
      />
      <LookOverFlow
        open={lookOver !== null}
        {...(lookOver ? { scope: lookOver } : {})}
        onClose={() => void handleLookOverClosed()}
        onBackToSort={() => setLookOver(null)}
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
