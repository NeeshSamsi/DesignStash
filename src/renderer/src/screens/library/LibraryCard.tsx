import type { ComponentProps } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { MockupCard } from '@renderer/components/MockupCard'

export interface LibraryCardProps extends Omit<ComponentProps<typeof MockupCard>, 'ref'> {
  /** The dnd id: the mockup id as a string. */
  dndId: string
}

/**
 * A MockupCard that can be picked up and dropped on. Only the pointer starts a drag (after a few
 * pixels, so clicks still select); keyboard users make piles with ⌘G. No dnd role or tabindex is
 * added, so the card keeps its own semantics.
 */
export function LibraryCard({ dndId, ...cardProps }: LibraryCardProps) {
  const drag = useDraggable({ id: dndId })
  const drop = useDroppable({ id: dndId })
  return (
    <MockupCard
      {...cardProps}
      {...drag.listeners}
      ref={(node: HTMLDivElement | null) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
    />
  )
}
