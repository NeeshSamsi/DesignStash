import { useCallback } from 'react'
import type { LibraryItem } from '@shared/library'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUiStore } from './stores/uiStore'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

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
    <div className="group relative cursor-pointer" onClick={handleClickBody}>
      {/* Cover image — squircle-clipped (the bulged superellipse). Badges and the
          hover overlay live inside so they clip to the squircle too. */}
      <div className="squircle relative aspect-card w-full overflow-hidden bg-muted transition-opacity group-hover:opacity-95">
        {item.coverPath ? (
          <img
            src={`file://${item.coverPath}`}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No preview
          </div>
        )}

        {/* +N badge for group tiles */}
        {item.isGroup && item.variantCount > 1 && (
          <Badge variant="secondary" className="absolute left-2 top-2">
            +{item.variantCount - 1}
          </Badge>
        )}

        {/* Favourite indicator (always visible when favourited) */}
        {item.favourite && (
          <div className="absolute right-2 top-2 text-xs leading-none text-brand">★</div>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 flex items-end justify-end gap-1 bg-background/80 p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button aria-label="Open in Photoshop" onClick={handleOpenExternal} variant="secondary" size="xs">
            Open
          </Button>
          <Button aria-label="Zoom preview" onClick={handlePreview} variant="secondary" size="xs">
            Zoom
          </Button>
          <Button
            aria-label="Toggle favourite"
            onClick={handleToggleFavourite}
            variant={item.favourite ? 'default' : 'secondary'}
            size="xs"
          >
            {item.favourite ? '★' : '☆'}
          </Button>
        </div>
      </div>

      {/* Title + tags — plain text below the squircle, so nothing gets clipped */}
      <div className="px-1 pt-1.5">
        <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
        {item.tags.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.tags.map((t) => t.label).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}
