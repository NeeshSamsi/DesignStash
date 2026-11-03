import type { LibraryItem, Variant } from '@shared/library'
import { mockups } from '@renderer/lib/plural'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Oct", or "12 Oct 2025" when it was not this year. */
export function addedOn(createdAt: string, now: Date = new Date()): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`
}


/** A pile's mockups in the order the sidebar lists them: the top one first, the rest as they come. */
export function pileOrder(variants: readonly Variant[]): Variant[] {
  return [...variants].sort((a, b) => Number(b.isTop) - Number(a.isTop))
}

export type DetailsKind = 'mockup' | 'pile' | 'top'

/**
 * The caption under the title: "Mockup · added 12 Oct", "Pile · 4 mockups", and for a mockup in a
 * pile, the pile by its base (pile-titles.md, D3.2): "Top of Clay iPhone 15 Pro · added 12 Oct" or
 * "Variant in Clay iPhone 15 Pro · added 12 Oct".
 */
export function detailsCaption(
  item: Pick<LibraryItem, 'id' | 'title' | 'pileId' | 'createdAt' | 'pile'>,
  kind: DetailsKind,
  now?: Date
): string {
  if (kind === 'pile') return `Pile · ${mockups(item.pile?.memberCount ?? 1)}`
  const added = addedOn(item.createdAt, now)
  const lead =
    typeof item.pileId === 'number'
      ? `${item.pileId === item.id ? 'Top of' : 'Variant in'} ${item.title}`
      : kind === 'top'
        ? 'Top mockup'
        : 'Mockup'
  return added ? `${lead} · added ${added}` : lead
}
