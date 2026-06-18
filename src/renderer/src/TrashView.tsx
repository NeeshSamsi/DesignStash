import { useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { useLibraryStore } from './stores/libraryStore'
import { useUiStore } from './stores/uiStore'
import { toast } from './stores/toastStore'

export default function TrashView() {
  const trash = useLibraryStore((s) => s.trash)
  const setTrash = useLibraryStore((s) => s.setTrash)
  const setStats = useLibraryStore((s) => s.setStats)
  const setLoading = useLibraryStore((s) => s.setLoading)
  const isLoading = useLibraryStore((s) => s.isLoading)

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    const [trashRes, statsRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_TRASH_LIST, undefined),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined),
    ])
    setLoading(false)
    if (trashRes.success) setTrash(trashRes.data.items)
    if (statsRes.success) setStats(statsRes.data)
  }, [setLoading, setTrash, setStats])

  useEffect(() => {
    void fetchTrash()
  }, [fetchTrash])

  const handleRestore = async (item: LibraryItem) => {
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_RESTORE, { mockupId: item.id })
    if (res.success) {
      toast(`"${item.title}" restored`, 'success')
      void fetchTrash()
    }
  }

  const openModal = useUiStore((s) => s.openModal)

  const handleDeletePermanently = (item: LibraryItem) => {
    openModal({
      kind: 'confirm',
      title: 'Delete permanently?',
      message: `"${item.title}" will be deleted forever and cannot be recovered.`,
      danger: true,
      onConfirm: async () => {
        const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, {
          mockupId: item.id,
        })
        if (res.success) void fetchTrash()
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-neutral-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Trash</h2>
        <p className="text-xs text-neutral-500">{trash.length} item{trash.length !== 1 ? 's' : ''}</p>
      </div>

      {trash.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-neutral-400 text-sm">Trash is empty</p>
          <p className="text-neutral-600 text-xs">Trashed mockups appear here</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800">
          {trash.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-800/50 transition-colors"
            >
              <div className="w-12 h-12 bg-neutral-700 rounded-lg overflow-hidden shrink-0">
                <img
                  src={`file://${item.coverPath}`}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-100 truncate">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-neutral-500 truncate">{item.description}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => void handleRestore(item)}
                  className="text-xs bg-neutral-700 hover:bg-neutral-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                  aria-label={`Restore ${item.title}`}
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDeletePermanently(item)}
                  className="text-xs bg-red-900/60 hover:bg-red-800/60 text-red-300 px-3 py-1.5 rounded-lg transition-colors"
                  aria-label={`Delete ${item.title} permanently`}
                >
                  Delete permanently
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
