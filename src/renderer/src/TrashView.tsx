import { useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { useLibraryStore } from './stores/libraryStore'
import { useUiStore } from './stores/uiStore'
import { toast } from './stores/toastStore'
import { Button } from './ui/button'

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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Trash</h2>
        <p className="text-xs text-muted-foreground">
          {trash.length} item{trash.length !== 1 ? 's' : ''}
        </p>
      </div>

      {trash.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">Trash is empty</p>
          <p className="text-xs text-muted-foreground">Trashed mockups appear here</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {trash.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                <img
                  src={`file://${item.coverPath}`}
                  alt={item.title}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{item.title}</p>
                {item.description && (
                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleRestore(item)}
                  aria-label={`Restore ${item.title}`}
                >
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeletePermanently(item)}
                  aria-label={`Delete ${item.title} permanently`}
                >
                  Delete permanently
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
