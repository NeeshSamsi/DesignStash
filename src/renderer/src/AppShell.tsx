import { useState } from 'react'
import { useUiStore } from './stores/uiStore'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FullscreenPreview } from './FullscreenPreview'
import { DetailModal } from './DetailModal'
import { ReconciliationModal } from './ReconciliationModal'
import { ToastContainer } from './ui/Toast'

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
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-1 relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Add mockups"
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-md text-sm font-medium bg-brand-500 hover:bg-brand-500/80 text-white transition-colors"
      >
        + Add
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 mt-1 z-20 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden"
          onBlur={() => setOpen(false)}
        >
          <button
            onClick={() => { onAddFiles?.(); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-neutral-700 transition-colors"
          >
            Add files…
          </button>
          <button
            onClick={() => { onAddFolder?.(); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-neutral-700 transition-colors"
          >
            Add folder…
          </button>
        </div>
      )}
    </div>
  )
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
        active
          ? 'bg-neutral-700 text-slate-100'
          : 'text-neutral-400 hover:bg-neutral-800 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
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
    <div className="flex h-screen overflow-hidden bg-neutral-900 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-neutral-800 bg-neutral-900">
        {/* Nav — top section */}
        <nav className="flex-1 p-2 pt-4 space-y-0.5" aria-label="Main navigation">
          <NavItem label="Library" active={view === 'library'} onClick={() => setView('library')} />
          <NavItem label="Trash" active={view === 'trash'} onClick={() => setView('trash')} />
          <AddMenu
            {...(onAddFiles !== undefined && { onAddFiles })}
            {...(onAddFolder !== undefined && { onAddFolder })}
          />
        </nav>

        {/* Bottom — app icon + settings */}
        <div className="p-2 pb-4 border-t border-neutral-800 space-y-0.5">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-bold text-brand-500 tracking-widest">DS</span>
            <span className="text-sm font-semibold text-slate-100">DesignStash</span>
          </div>
          <NavItem
            label="Settings"
            active={view === 'settings'}
            onClick={() => setView('settings')}
          />
        </div>
      </aside>

      {/* Right panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {topBar && (
          <div className="shrink-0 border-b border-neutral-800">{topBar}</div>
        )}

        {/* Main content — drop target */}
        <main
          className={`flex-1 overflow-auto transition-colors ${isDropping ? 'bg-brand-500/10' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
        >
          {children}
        </main>
      </div>

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
      {modal?.kind === 'detail' && (
        <DetailModal mockupId={modal.mockupId} onClose={closeModal} />
      )}
      {modal?.kind === 'reconcile' && (
        <ReconciliationModal report={modal.report} onClose={closeModal} />
      )}

      {/* Toast layer */}
      <ToastContainer />
    </div>
  )
}
