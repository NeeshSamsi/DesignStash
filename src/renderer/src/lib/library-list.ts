import type { LibraryItem } from '@shared/library'

/**
 * Pure rules for the My Stash page: what the list shows, what an empty list says, and what dropping
 * or piling cards does. The page wires these to IPC.
 */

/**
 * The Starred view keeps a card you just unstarred until you leave (the star empties, the card
 * stays, with Undo). `next` is a fresh fetch; lingering cards it dropped go back where they were.
 */
export function mergeLingering(
  previous: readonly LibraryItem[],
  next: readonly LibraryItem[],
  lingering: ReadonlySet<number>
): LibraryItem[] {
  if (lingering.size === 0) return [...next]
  const present = new Set(next.map((item) => item.id))
  const merged = [...next]
  previous.forEach((item, index) => {
    if (!lingering.has(item.id) || present.has(item.id)) return
    merged.splice(Math.min(index, merged.length), 0, { ...item, favourite: false })
  })
  return merged
}

export interface NoResultsInput {
  /** The search text. */
  query: string
  /** Tags and categories picked in the filter. */
  filterCount: number
  starred: boolean
}

export interface NoResultsCopy {
  title: string
  description: string
  /** The one literal action, or null when there is nothing to clear. */
  clearLabel: string | null
}

/**
 * What the grid says when it has no cards. A search or filter result repeats the query and offers
 * the one matching clear action; an empty Starred explains how to star, with no button. It never
 * says the library is empty.
 */
export function noResultsCopy({ query, filterCount, starred }: NoResultsInput): NoResultsCopy {
  const text = query.trim()
  const searching = text !== ''
  const filtering = filterCount > 0
  if (searching && filtering) {
    return {
      title: `No mockups match “${text}” with these filters`,
      description: 'Try a different search, or loosen the filters.',
      clearLabel: 'Clear search and filters'
    }
  }
  if (searching) {
    return {
      title: `No mockups match “${text}”`,
      description: 'Check the spelling, or try a shorter search.',
      clearLabel: 'Clear search'
    }
  }
  if (filtering) {
    return {
      title: 'No mockups match these filters',
      description: 'Every picked tag has to match. Try picking fewer.',
      clearLabel: 'Clear filters'
    }
  }
  return starred
    ? {
        title: 'Nothing starred yet',
        description: 'Hover a mockup and press its star to keep it here.',
        clearLabel: 'Go to All'
      }
    : { title: 'Nothing here yet', description: '', clearLabel: null }
}

/** The IPC call a drop or ⌘G turns into. */
export type PileIntent =
  | { kind: 'create'; memberIds: number[]; topId: number }
  | { kind: 'add'; pileId: number; memberIds: number[] }
  | { kind: 'merge'; sourceIds: number[]; targetId: number }

const ids = (items: readonly LibraryItem[]) => items.map((item) => item.id)

/**
 * Dropping cards on a card. A single on a single starts a pile with the target on top; singles on a
 * pile join it; anything that includes a pile merges into the target, whose top stays on top.
 * Dropping on yourself does nothing.
 */
export function planDrop(
  dragged: readonly LibraryItem[],
  target: LibraryItem
): PileIntent | null {
  const others = dragged.filter((item) => item.id !== target.id)
  if (others.length === 0) return null
  if (others.some((item) => item.isGroup)) {
    return { kind: 'merge', sourceIds: ids(others), targetId: target.id }
  }
  if (target.isGroup) return { kind: 'add', pileId: target.id, memberIds: ids(others) }
  return { kind: 'create', memberIds: [target.id, ...ids(others)], topId: target.id }
}

/** The label a drop target shows while a drag is over it. */
export function dropHint(dragged: readonly LibraryItem[], target: LibraryItem): string {
  const others = dragged.filter((item) => item.id !== target.id)
  if (others.some((item) => item.isGroup)) return 'Merge into this pile'
  if (target.isGroup) return 'Add to this pile'
  return others.length <= 1 ? 'Start a pile' : `New pile from ${others.length + 1} mockups`
}

/**
 * ⌘G on a selection: a pile from the selected cards, the first selected on top. A selection that
 * already holds piles merges into its first card instead. Needs two or more.
 */
export function planNewPile(selected: readonly LibraryItem[]): PileIntent | null {
  const [first, ...rest] = selected
  if (!first || rest.length === 0) return null
  if (selected.some((item) => item.isGroup)) {
    return { kind: 'merge', sourceIds: ids(rest), targetId: first.id }
  }
  return { kind: 'create', memberIds: ids(selected), topId: first.id }
}

/** Piles in a selection, for ⇧⌘G (Disband pile). */
export function pilesIn(selected: readonly LibraryItem[]): LibraryItem[] {
  return selected.filter((item) => item.isGroup)
}

/**
 * Which cards a drag carries: the whole selection when the dragged card is in it, otherwise just
 * that card.
 */
export function draggedItems(
  items: readonly LibraryItem[],
  selectedIds: readonly string[],
  activeId: number
): LibraryItem[] {
  const selected = new Set(selectedIds)
  if (selected.has(String(activeId))) return items.filter((item) => selected.has(String(item.id)))
  return items.filter((item) => item.id === activeId)
}
