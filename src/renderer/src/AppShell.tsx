import type { ReactNode } from 'react'
import { useUiStore, type AppView } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { ConfirmDialog } from './components/_legacy/ConfirmDialog'
import { FullscreenPreview } from './FullscreenPreview'
import { DetailModal } from './screens/detail/DetailModal'
import { ReconciliationModal } from './ReconciliationModal'
import { Toaster } from './ui/sonner'
import { ActivityDock } from './components/ActivityDock'
import { AddMenu } from './components/AddMenu'
import { AppWindow } from './components/AppWindow'
import { DropOverlay } from './components/DropOverlay'
import { GlobalSearch } from './components/GlobalSearch'
import { PageHeader } from './components/PageHeader'
import { SidebarNav, type SidebarNavKey } from './components/SidebarNav'
import { useShortcut, useShortcutDispatcher } from './lib/shortcuts'

interface AppShellProps {
  children: ReactNode
  /** Legacy toolbar, shown above the page. */
  topBar?: ReactNode
  /** The import card; it sits in the ActivityDock under the toasts. */
  importCard?: ReactNode
  /** An import is running: Add is disabled. */
  importing?: boolean
  /** Hide the PageHeader (pipeline screens bring their own heading). */
  showHeader?: boolean
  onAddFiles?: () => void
  onAddFolder?: () => void
  onDrop?: (e: React.DragEvent<HTMLElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLElement>) => void
  onDragEnter?: (e: React.DragEvent<HTMLElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLElement>) => void
  isDropping?: boolean
}

const mockups = (n: number) => `${n} ${n === 1 ? 'mockup' : 'mockups'}`

/** Where each page sits in the header. Trash and Settings still bring their own heading. */
function headerFor(view: AppView, total: number) {
  if (view === 'all') {
    return {
      parent: 'My Stash',
      current: 'All',
      description: `${mockups(total)} · favourites always sort first`
    }
  }
  if (view === 'starred') {
    return { parent: 'My Stash', current: 'Starred', description: mockups(total) }
  }
  return null
}

const NAV_VIEWS: Partial<Record<SidebarNavKey, AppView>> = {
  all: 'all',
  starred: 'starred',
  trash: 'trash'
}

export default function AppShell({
  children,
  topBar,
  importCard,
  importing = false,
  showHeader = true,
  onAddFiles,
  onAddFolder,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  isDropping = false
}: AppShellProps) {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const modal = useUiStore((s) => s.modal)
  const closeModal = useUiStore((s) => s.closeModal)
  const stats = useLibraryStore((s) => s.stats)
  const query = useLibraryStore((s) => s.query)
  const setQuery = useLibraryStore((s) => s.setQuery)

  useShortcutDispatcher()
  // ⌘K is handled by GlobalSearch (useSearchFocusShortcut); reserving it keeps anyone else off it.
  useShortcut({ id: 'search.focus', combo: 'mod+k' })
  useShortcut({
    id: 'import.add-files',
    combo: 'mod+o',
    handler: () => {
      if (!importing) onAddFiles?.()
    }
  })
  useShortcut({
    id: 'import.add-folder',
    combo: 'mod+shift+o',
    handler: () => {
      if (!importing) onAddFolder?.()
    }
  })

  const header = showHeader
    ? headerFor(view, view === 'starred' ? stats.favourites : stats.total)
    : null

  const onQueryChange = (next: string) => {
    setQuery(next)
    // Search looks through My Stash: typing from Trash or Settings takes you there.
    if (next !== '' && (view === 'trash' || view === 'settings')) setView('all')
  }

  const dialog =
    modal === null ? undefined : (
      <>
        {modal.kind === 'confirm' && (
          <ConfirmDialog
            title={modal.title}
            message={modal.message}
            {...(modal.danger !== undefined && { danger: modal.danger })}
            onConfirm={() => {
              modal.onConfirm()
              closeModal()
            }}
            onCancel={closeModal}
          />
        )}
        {modal.kind === 'preview' && (
          <FullscreenPreview coverPath={modal.coverPath} onClose={closeModal} />
        )}
        {modal.kind === 'detail' && <DetailModal mockupId={modal.mockupId} onClose={closeModal} />}
        {modal.kind === 'reconcile' && (
          <ReconciliationModal report={modal.report} onClose={closeModal} />
        )}
      </>
    )

  return (
    <div
      data-slot="app-shell"
      className="h-screen overflow-hidden"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <AppWindow
        state={isDropping ? 'drag-over' : 'idle'}
        showHeader={header !== null}
        search={<GlobalSearch defaultQuery={query} onQueryChange={onQueryChange} />}
        sidebar={
          <SidebarNav
            variant="none"
            {...(view !== 'settings' ? { selected: view as SidebarNavKey } : {})}
            counts={{
              library: stats.total,
              starred: stats.favourites,
              all: stats.total,
              trash: stats.trashed
            }}
            settingsActive={view === 'settings'}
            onNavigate={(key) => {
              const next = NAV_VIEWS[key]
              if (next) setView(next)
            }}
            onOpenSettings={() => setView('settings')}
            add={
              <AddMenu
                disabled={importing}
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
                  parent={header.parent}
                  description={header.description}
                />
              )
            }
          : {})}
        page={
          <div className="flex h-full flex-col">
            {topBar && <div className="shrink-0 border-b border-border">{topBar}</div>}
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          </div>
        }
        drop={<DropOverlay />}
        {...(dialog ? { dialog } : {})}
      />
      <ActivityDock
        className="fixed right-4 bottom-4 z-50"
        toastContent={<Toaster />}
        importContent={importCard}
      />
    </div>
  )
}
