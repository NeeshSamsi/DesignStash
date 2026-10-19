import { useUiStore } from './stores/uiStore'
import { ConfirmDialog } from './components/_legacy/ConfirmDialog'
import { FullscreenPreview } from './FullscreenPreview'
import { DetailModal } from './DetailModal'
import { ReconciliationModal } from './ReconciliationModal'
import { Toaster } from './ui/sonner'
import { Button } from './ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from './ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { cn } from './lib/utils'

interface AppShellProps {
  children: React.ReactNode
  topBar?: React.ReactNode
  onAddFiles?: () => void
  onAddFolder?: () => void
  onDrop?: (e: React.DragEvent<HTMLElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLElement>) => void
  onDragEnter?: (e: React.DragEvent<HTMLElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLElement>) => void
  isDropping?: boolean
}

function AddMenu({
  onAddFiles,
  onAddFolder,
}: {
  onAddFiles?: () => void
  onAddFolder?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="w-full" size="sm" aria-label="Add mockups">
          + Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuItem onSelect={() => onAddFiles?.()}>Add files…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAddFolder?.()}>Add folder…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AppShell({
  children,
  topBar,
  onAddFiles,
  onAddFolder,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  isDropping = false,
}: AppShellProps) {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const modal = useUiStore((s) => s.modal)
  const closeModal = useUiStore((s) => s.closeModal)

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '14rem' } as React.CSSProperties}
      className="h-screen overflow-hidden"
    >
      <Sidebar collapsible="none">
        <SidebarContent className="p-2 pt-4">
          <SidebarGroup className="gap-1 p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === 'library'}
                  onClick={() => setView('library')}
                >
                  Library
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === 'trash'} onClick={() => setView('trash')}>
                  Trash
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="px-2 pt-1">
              <AddMenu
                {...(onAddFiles !== undefined && { onAddFiles })}
                {...(onAddFolder !== undefined && { onAddFolder })}
              />
            </div>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2 pb-4">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="text-xs font-bold tracking-widest text-brand">DS</span>
            <span className="text-sm font-semibold text-sidebar-foreground">DesignStash</span>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={view === 'settings'}
                onClick={() => setView('settings')}
              >
                Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset
        className={cn('overflow-hidden transition-colors', isDropping && 'bg-primary/10')}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        {topBar && <div className="shrink-0 border-b border-border">{topBar}</div>}
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>

      {/* Modal layer */}
      {modal?.kind === 'confirm' && (
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
      {modal?.kind === 'preview' && (
        <FullscreenPreview coverPath={modal.coverPath} onClose={closeModal} />
      )}
      {modal?.kind === 'detail' && <DetailModal mockupId={modal.mockupId} onClose={closeModal} />}
      {modal?.kind === 'reconcile' && (
        <ReconciliationModal report={modal.report} onClose={closeModal} />
      )}

      {/* Toast layer */}
      <Toaster />
    </SidebarProvider>
  )
}
