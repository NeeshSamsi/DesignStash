import type { LibraryItem } from '@shared/library'
import MockupTile from './MockupTile'
import { EmptyState, LoadingState } from './components/States'
import { Button } from './ui/button'

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
          onAddFiles && <Button onClick={onAddFiles}>+ Import files</Button>
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
