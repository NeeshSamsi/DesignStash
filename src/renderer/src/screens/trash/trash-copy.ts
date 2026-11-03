import type { TrashOrigin } from '@shared/inbox'

/** Where Restore puts a card from each origin. An undone import's mockups go back to To sort. */
const HOME: Record<TrashOrigin, string> = {
  'my-stash': 'My Stash',
  'to-sort': 'To sort',
  'to-stash': 'To stash',
  import: 'To sort'
}

/**
 * A Trash card's line under its title: where it came from and when (design/specs/undo.md). A card
 * from an inbox was tossed ("Tossed from To sort · 2 min ago"); one from My Stash was trashed.
 */
export function trashCaption(origin: TrashOrigin, ago: string): string {
  if (origin === 'my-stash') return `Trashed ${ago}`
  if (origin === 'import') return `From an undone import · ${ago}`
  return `Tossed from ${HOME[origin]} · ${ago}`
}

/** The Restore toast: where the cards went back to, when they all went back to one place. */
export function restoredTo(origins: readonly TrashOrigin[]): string {
  const homes = new Set(origins.map((origin) => HOME[origin]))
  const [only] = homes
  return homes.size === 1 && only !== undefined ? `Restored to ${only}` : 'Restored'
}
