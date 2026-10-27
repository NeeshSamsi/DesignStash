import type { FilterChip } from './tag-filter'

import { mockups, pluralise } from './plural'

/**
 * What the picked tags read as in the header: “Device · iPhone, MacBook; Style · Clay”. A whole
 * category reads “all of Device”. Tags keep the order they were picked in, grouped by category.
 */
export function filterSummary(chips: readonly Pick<FilterChip, 'category' | 'label'>[]): string {
  const wholes = chips.filter((chip) => chip.category === undefined)
  const byCategory = new Map<string, string[]>()
  for (const chip of chips) {
    if (chip.category === undefined) continue
    byCategory.set(chip.category, [...(byCategory.get(chip.category) ?? []), chip.label])
  }
  return [
    ...wholes.map((chip) => chip.label.replace(/^All in /, 'all of ')),
    ...[...byCategory].map(([category, labels]) => `${category} · ${labels.join(', ')}`)
  ].join('; ')
}

interface LibraryDescription {
  /** My Stash › All, or Starred. */
  view: 'all' | 'starred'
  /** Mockups the page shows right now. */
  shown: number
  total: number
  starred: number
  query: string
  chips: readonly Pick<FilterChip, 'category' | 'label'>[]
}

/**
 * The line under the My Stash header. At rest it counts the view; while searching or filtering it
 * counts the result and says what narrowed it, so the page never shows one number in the header and
 * another beside it (Figma ↳ Library C2.2 and C3.4).
 */
export function libraryDescription(input: LibraryDescription): string {
  const query = input.query.trim()
  const filtered = input.chips.length > 0
  if (query === '' && !filtered) {
    return input.view === 'starred' ? pluralise(input.starred, 'favourite') : mockups(input.total)
  }
  const lead =
    query !== ''
      ? `${pluralise(input.shown, 'result')} for “${query}”`
      : mockups(input.shown)
  return filtered ? `${lead} · filtered by ${filterSummary(input.chips)}` : lead
}
