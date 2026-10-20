import { useEffect, useRef, type ReactNode } from 'react'
import { useUiStore, type AppView } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { DetailModal } from './screens/detail/DetailModal'
import { SettingsModal } from './screens/settings'
import { StashCheckModal } from './screens/integrity'
import { Toaster } from './ui/sonner'
import { ActivityDock } from './components/ActivityDock'
import { AddMenu } from './components/AddMenu'
import { AppWindow } from './components/AppWindow'
import { GlobalSearch } from './components/GlobalSearch'
import { PageHeader } from './components/PageHeader'
import { SidebarNav, sidebarNavVariant, type SidebarNavKey } from './components/SidebarNav'
import { useInboxCounts } from './hooks/use-inbox-counts'
import { dockBottom } from './lib/dock'
import { useDockStore } from './stores/dockStore'
import { useShortcut, useShortcutDispatcher } from './lib/shortcuts'

interface AppShellProps {
  children: ReactNode
  /** Hide the PageHeader (pipeline screens bring their own heading). */
  showHeader?: boolean
  onAddFiles?: () => void
  onAddFolder?: () => void
  /** The copy widget (Gather); it sits in the ActivityDock under the toasts. */
  copyWidget?: ReactNode
  /** The window-wide DropOverlay while files are dragged over a page that takes them. */
  dropOverlay?: ReactNode
  /** The cursor-following DropHint over a page that does not. */
  dropHint?: ReactNode
}

const mockups = (n: number) => `${n} ${n === 1 ? 'mockup' : 'mockups'}`

interface HeaderCounts {
  total: number
  favourites: number
  toSort: number
  toStash: number
  trash: number
}

/** Where each page sits in the header. Settings still brings its own heading. */
function headerFor(view: AppView, counts: HeaderCounts) {
  switch (view) {
    case 'all':
      return { parent: 'My Stash', current: 'All', description: mockups(counts.total) }
    case 'starred':
      return { parent: 'My Stash', current: 'Starred', description: mockups(counts.favourites) }
    case 'to-sort':
      return { current: 'To sort', description: `${mockups(counts.toSort)} waiting to be sorted` }
    case 'to-stash':
      return {
        current: 'To stash',
        description: `${counts.toStash} ${counts.toStash === 1 ? 'pile or mockup' : 'piles and mockups'} waiting`
      }
    case 'trash':
      return {
        current: 'Trash',
        description: `${counts.trash} ${counts.trash === 1 ? 'item' : 'items'}`
      }
    default:
      return null
  }
}

const NAV_VIEWS: Partial<Record<SidebarNavKey, AppView>> = {
  all: 'all',
  starred: 'starred',
  'to-sort': 'to-sort',
  'to-stash': 'to-stash',
  trash: 'trash'
}

export default function AppShell({
  children,
  showHeader = true,
  onAddFiles,
  onAddFolder,
  copyWidget,
  dropOverlay,
  dropHint
}: AppShellProps) {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const openSettings = useUiStore((s) => s.openSettings)
  const settingsSection = useUiStore((s) => s.settingsSection)
  const setSettingsSection = useUiStore((s) => s.setSettingsSection)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const modal = useUiStore((s) => s.modal)
  const closeModal = useUiStore((s) => s.closeModal)
  const stats = useLibraryStore((s) => s.stats)
  const searchText = useUiStore((s) => s.searchText)
  const setSearchText = useUiStore((s) => s.setSearchText)
  const inbox = useInboxCounts()
  // The copy widget and the toasts sit above the page's pinned action bar, never over it.
  const barTop = useDockStore((s) => s.barTop)
  const query = useLibraryStore((s) => s.query)
  const setQuery = useLibraryStore((s) => s.setQuery)

  useShortcutDispatcher()
  // ⌘K is handled by GlobalSearch (useSearchFocusShortcut); reserving it keeps anyone else off it.
  useShortcut({ id: 'search.focus', combo: 'mod+k' })
  useShortcut({
    id: 'import.add-files',
    combo: 'mod+o',
    handler: () => onAddFiles?.()
  })
  useShortcut({
    id: 'import.add-folder',
    combo: 'mod+shift+o',
    handler: () => onAddFolder?.()
  })

  // The page's "Clear search" empties the library query; the field follows it.
  const lastQuery = useRef(query)
  useEffect(() => {
    if (query === '' && lastQuery.current !== '') useUiStore.getState().setSearchText('')
    lastQuery.current = query
  }, [query])

  const header = showHeader
    ? headerFor(view, {
        total: stats.total,
        favourites: stats.favourites,
        toSort: inbox?.toSort ?? 0,
        toStash: inbox?.toStash ?? 0,
        trash: inbox?.trash ?? stats.trashed
      })
    : null

  const onQueryChange = (next: string) => {
    setQuery(next)
    // Search looks through My Stash: typing from any other page takes you there.
    if (next !== '' && view !== 'all' && view !== 'starred') setView('all')
  }

  const dialog =
    modal === null ? undefined : (
      <>
        {modal.kind === 'detail' && <DetailModal mockupId={modal.mockupId} onClose={closeModal} />}
        {modal.kind === 'reconcile' && (
          <StashCheckModal
            report={modal.report}
            onClose={closeModal}
            onOpenSettings={() => openSettings('my-stash')}
          />
        )}
      </>
    )

  return (
    <div data-slot="app-shell" className="h-screen overflow-hidden">
      <AppWindow
        state={dropOverlay ? 'drag-over' : 'idle'}
        showHeader={header !== null}
        search={
          <GlobalSearch
            value={searchText}
            onValueChange={setSearchText}
            onQueryChange={onQueryChange}
          />
        }
        sidebar={
          <SidebarNav
            variant={sidebarNavVariant(inbox?.toSort ?? 0, inbox?.toStash ?? 0)}
            selected={view as SidebarNavKey}
            counts={{
              library: stats.total,
              starred: stats.favourites,
              all: stats.total,
              toSort: inbox?.toSort ?? 0,
              toStash: inbox?.toStash ?? 0,
              trash: inbox?.trash ?? stats.trashed
            }}
            settingsActive={settingsOpen}
            onNavigate={(key) => {
              const next = NAV_VIEWS[key]
              if (next) setView(next)
            }}
            onOpenSettings={() => openSettings()}
            add={
              <AddMenu
                {...(onAddFiles ? { onAddFiles } : {})}
                {...(onAddFolder ? { onAddFolder } : {})}
              />
            }
          />
        }
        {...(header
          ? {
              header: (
                <PageHeader
                  current={header.current}
                  breadcrumb={header.parent !== undefined}
                  {...(header.parent !== undefined ? { parent: header.parent } : {})}
                  description={header.description}
                />
              )
            }
          : {})}
        page={<div className="h-full overflow-auto">{children}</div>}
        {...(dropOverlay ? { drop: dropOverlay } : {})}
        {...(dialog ? { dialog } : {})}
      />
      <ActivityDock
        className="fixed right-4 z-50"
        style={{ bottom: dockBottom(barTop, window.innerHeight) }}
        toastContent={<Toaster />}
        importContent={copyWidget}
      />
      {dropHint}
      <SettingsModal
        open={settingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={closeSettings}
        onOpenTrash={() => setView('trash')}
        onReview={() => useUiStore.getState().openModal({ kind: 'reconcile' })}
      />
    </div>
  )
}
