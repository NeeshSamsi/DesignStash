import { useCallback } from 'react'
import type { LibraryItem } from '@shared/library'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUiStore } from './stores/uiStore'

interface MockupTileProps {
  item: LibraryItem
  onRefresh: () => void
}

export default function MockupTile({ item, onRefresh }: MockupTileProps) {
  const openModal = useUiStore((s) => s.openModal)

  const handleOpenExternal = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void window.api.invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: item.id })
    },
    [item.id]
  )

  const handlePreview = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      openModal({ kind: 'preview', coverPath: `file://${item.coverPath}` })
    },
    [item.coverPath, openModal]
  )

  const handleToggleFavourite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void (async () => {
        await window.api.invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, {
          mockupId: item.id,
          favourite: !item.favourite,
        })
        onRefresh()
      })()
    },
    [item.id, item.favourite, onRefresh]
  )

  const handleClickBody = useCallback(() => {
    openModal({ kind: 'detail', mockupId: item.id })
  }, [item.id, openModal])

  return (
    <div
      className="group relative bg-neutral-800 rounded-xl overflow-hidden cursor-pointer border border-neutral-700 hover:border-neutral-500 transition-colors"
      onClick={handleClickBody}
    >
      {/* Cover image */}
      <div className="aspect-card w-full overflow-hidden bg-neutral-700">
        {item.coverPath ? (
          <img
            src={`file://${item.coverPath}`}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">
            No preview
          </div>
        )}
      </div>

      {/* Title row */}
      <div className="px-2 py-1.5">
        <p className="text-xs font-medium text-slate-200 truncate">{item.title}</p>
        {item.tags.length > 0 && (
          <p className="text-xs text-neutral-500 truncate mt-0.5">
            {item.tags.map((t) => t.label).join(', ')}
          </p>
        )}
      </div>

      {/* +N badge for group tiles */}
      {item.isGroup && item.variantCount > 1 && (
        <div className="absolute top-1.5 left-1.5 bg-neutral-900/80 text-xs px-1.5 py-0.5 rounded text-slate-300 font-medium">
          +{item.variantCount - 1}
        </div>
      )}

      {/* Favourite indicator (always visible when favourited) */}
      {item.favourite && (
        <div className="absolute top-1.5 right-1.5 text-yellow-400 text-xs leading-none">★</div>
      )}

      {/* Hover overlay with actions */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-1 p-1.5">
        <button
          aria-label="Open in Photoshop"
          onClick={handleOpenExternal}
          className="bg-neutral-800/90 hover:bg-neutral-700 text-slate-200 text-xs px-2 py-1 rounded transition-colors"
        >
          Open
        </button>
        <button
          aria-label="Zoom preview"
          onClick={handlePreview}
          className="bg-neutral-800/90 hover:bg-neutral-700 text-slate-200 text-xs px-2 py-1 rounded transition-colors"
        >
          Zoom
        </button>
        <button
          aria-label="Toggle favourite"
          onClick={handleToggleFavourite}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            item.favourite
              ? 'bg-yellow-600/80 hover:bg-yellow-600 text-white'
              : 'bg-neutral-800/90 hover:bg-neutral-700 text-slate-200'
          }`}
        >
          {item.favourite ? '★' : '☆'}
        </button>
      </div>
    </div>
  )
}
