import type { LibraryItem } from '@shared/library'
import MockupTile from './MockupTile'
import { EmptyState, LoadingState } from './ui/States'

interface MockupGridProps {
  items: LibraryItem[]
  isLoading: boolean
  onRefresh: () => void
  onAddFiles?: () => void
}

export default function MockupGrid({
  items,
  isLoading,
  onRefresh,
  onAddFiles,
}: MockupGridProps) {
  if (isLoading) {
    return <LoadingState message="Loading library…" />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your library is empty"
        description="Import PSD files or folders to get started."
        action={
          onAddFiles && (
            <button
              onClick={onAddFiles}
              className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-500/80 text-white text-sm font-medium transition-colors"
            >
              + Import files
            </button>
          )
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => (
        <MockupTile key={item.id} item={item} onRefresh={onRefresh} />
      ))}
    </div>
  )
}
