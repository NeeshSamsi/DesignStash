import { useEffect, useRef, type ReactNode } from 'react'
import { useUiStore, type AppView } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { DetailsSidebar, DiscardAsk } from './screens/details/DetailsSidebar'
import { mockupsLabel } from './screens/details/details-model'
import { usePanelLayout } from './screens/details/use-panel-layout'
import { useRevealSelected } from './screens/details/use-reveal-selected'
import { useDetailsEscape } from './screens/details/use-details-escape'
import { useDetailsStore } from './stores/detailsStore'
import { PANEL_SHARE } from './screens/details/panel-share'
import './styles/details-transition.css'
import { SettingsModal } from './screens/settings'
import { StashCheckModal } from './screens/integrity'
import { Toaster } from './ui/sonner'
import { ActivityDock } from './components/ActivityDock'
import { Button } from './components/Button'
import { AppWindow } from './components/AppWindow'
import { GlobalSearch, focusGlobalSearch } from './components/GlobalSearch'
import { PageHeader } from './components/PageHeader'
import { SidebarNav, sidebarNavVariant, type SidebarNavKey } from './components/SidebarNav'
import { useInboxCounts } from './hooks/use-inbox-counts'
import { useHeaderSlot } from './lib/page-header-slot'
import { libraryDescription } from './lib/library-header'
import { filterChips } from './lib/tag-filter'
import { useTagTreeStore } from './stores/tagTreeStore'
import { useShortcut, useShortcutDispatcher } from './lib/shortcuts'
import { useMenuCommands } from './lib/menu-commands'

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

/** How far the dock and toasts sit in from the corner they are anchored to. */
const DOCK_INSET = 16

const mockups = (n: number) => `${n} ${n === 1 ? 'mockup' : 'mockups'}`

interface HeaderCounts {
  total: number
  favourites: number
  toSort: number
  toStash: number
  trash: number
}

/** Where each page sits in the header. Settings still brings its own heading. */
function headerFor(view: AppView, counts: HeaderCounts, library: string) {
  switch (view) {
    case 'all':
      return { parent: 'My Stash', current: 'All', description: library }
    case 'starred':
      return { parent: 'My Stash', current: 'Starred', description: library }
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
  const statsLoaded = useLibraryStore((s) => s.statsLoaded)
  const searchText = useUiStore((s) => s.searchText)
  const setSearchText = useUiStore((s) => s.setSearchText)
  const inbox = useInboxCounts()
  const setActionsEl = useHeaderSlot((s) => s.setActionsEl)
  const status = useHeaderSlot((s) => s.status)
  const query = useLibraryStore((s) => s.query)
  const shown = useLibraryStore((s) => s.items.length)
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const categoryIds = useLibraryStore((s) => s.categoryIds)
  const tagTree = useTagTreeStore((s) => s.tree)
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
  // The macOS menu's items run the same actions as the app's own controls and shortcuts.
  useMenuCommands({ addFiles: onAddFiles, addFolder: onAddFolder, focusSearch: focusGlobalSearch })

  // The page's "Clear search" empties the library query; the field follows it.
  const lastQuery = useRef(query)
  useEffect(() => {
    if (query === '' && lastQuery.current !== '') useUiStore.getState().setSearchText('')
    lastQuery.current = query
  }, [query])

  const pile = useDetailsStore((s) => s.pile)
  const sidebarOpen = useDetailsStore((s) => s.target !== null)
  useDetailsEscape()
  // The layout follows the selection inside a view transition, so the grid morphs instead of snapping.
  const panelOpen = usePanelLayout(sidebarOpen)
  useRevealSelected(panelOpen)
  // Toasts and the dock sit 16px inside the container's bottom-right corner: left of the sidebar while
  // it is open, moving with the panel (they have transition names) so they never cover its buttons.
  const dockRight = DOCK_INSET + (panelOpen ? PANEL_SHARE : 0)

  const header = showHeader
    ? pile
      ? {
          parent: 'My Stash',
          current: pile.title,
          description: `Pile · ${mockupsLabel(pile.count)} · Esc to go back`
        }
      : headerFor(
          view,
          {
            total: stats.total,
            favourites: stats.favourites,
            toSort: inbox?.toSort ?? 0,
            toStash: inbox?.toStash ?? 0,
            trash: inbox?.trash ?? stats.trashed
          },
          // No count until the first stats answer; the blank keeps the line's height.
          !statsLoaded
            ? '\u00a0'
            : libraryDescription({
                view: view === 'starred' ? 'starred' : 'all',
                shown,
                total: stats.total,
                starred: stats.favourites,
                query,
                chips: filterChips(
                  (tagTree ?? []).map((c) => ({
                    categoryId: c.categoryId,
                    categoryLabel: c.categoryLabel,
                    tags: c.tags.map((t) => ({ tagId: t.tagId, label: t.label }))
                  })),
                  { tagIds: tagFilter, categoryIds },
                  { onRemoveTag: () => {}, onRemoveCategory: () => {} }
                )
              })
        )
    : null

  const onQueryChange = (next: string) => {
    setQuery(next)
    // Search looks through My Stash: typing from any other page takes you there.
    if (next !== '' && view !== 'all' && view !== 'starred') setView('all')
  }

  const dialog =
    modal === null ? undefined : (
      <>
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
          />
        }
        {...(header
          ? {
              header: (
                <PageHeader
                  current={header.current}
                  breadcrumb={header.parent !== undefined}
                  {...(pile ? { onParent: () => useDetailsStore.getState().closePile() } : {})}
                  {...(header.parent !== undefined ? { parent: header.parent } : {})}
                  description={status ? `${header.description} · ${status}` : header.description}
                  {...(!pile && query.trim() !== '' && (view === 'all' || view === 'starred')
                    ? {
                        descriptionAction: (
                          <Button variant="link" size="xs" onClick={() => setQuery('')}>
                            Clear
                          </Button>
                        )
                      }
                    : {})}
                >
                  {/* Pages put their actions here with HeaderActions. */}
                  <div ref={setActionsEl} className="contents" />
                </PageHeader>
              )
            }
          : {})}
        page={<div className="flex min-h-full flex-col *:flex-1">{children}</div>}
        aside={<DetailsSidebar open={panelOpen} />}
        asideOpen={panelOpen}
        {...(dropOverlay ? { drop: dropOverlay } : {})}
        {...(dialog ? { dialog } : {})}
      />
      <DiscardAsk />
      <ActivityDock
        className="pointer-events-auto fixed bottom-4 z-toast"
        style={{ right: dockRight, viewTransitionName: 'activity-dock' }}
        toastContent={
          <Toaster
            offset={{ right: dockRight, bottom: DOCK_INSET }}
            style={{ viewTransitionName: 'toasts' }}
          />
        }
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
