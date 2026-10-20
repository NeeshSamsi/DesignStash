/**
 * Pure rules behind the library's tag filter (TagFilterPopover, LibraryToolbar).
 * Tags are two tiers, category then tag, so every list here is flat: one level under a category.
 */

export interface FilterTag {
  tagId: number
  label: string
  /** How many mockups carry the tag. Shown beside the label when known. */
  count?: number
}

export interface FilterCategory {
  categoryId: number
  categoryLabel: string
  tags: FilterTag[]
}

/** What the person has picked: individual tags, and whole categories (`LIBRARY_LIST` `categoryIds`). */
export interface TagFilterSelection {
  tagIds: number[]
  categoryIds: number[]
}

const normalise = (text: string) => text.trim().toLocaleLowerCase()

/**
 * Tags whose label contains `query` (case-insensitive), grouped as given. Categories left with no
 * tags disappear, with or without a query: there is nothing in them to pick.
 */
export function filterTags(categories: readonly FilterCategory[], query: string): FilterCategory[] {
  const needle = normalise(query)
  return categories
    .map((category) => ({
      ...category,
      tags: needle ? category.tags.filter((tag) => normalise(tag.label).includes(needle)) : category.tags
    }))
    .filter((category) => category.tags.length > 0)
}

/** Tag count per category, for the pills. Pass the already-filtered list so counts follow the search. */
export function categoryCounts(
  filtered: readonly FilterCategory[]
): { categoryId: number; categoryLabel: string; count: number }[] {
  return filtered.map(({ categoryId, categoryLabel, tags }) => ({
    categoryId,
    categoryLabel,
    count: tags.length
  }))
}

export function totalTagCount(filtered: readonly FilterCategory[]): number {
  return filtered.reduce((sum, category) => sum + category.tags.length, 0)
}

/** The list a pill shows: one category, or everything for `null` or a category the search emptied. */
export function narrowToCategory(
  filtered: readonly FilterCategory[],
  categoryId: number | null
): FilterCategory[] {
  if (categoryId === null) return [...filtered]
  const match = filtered.filter((category) => category.categoryId === categoryId)
  return match.length > 0 ? match : [...filtered]
}

export function toggleTagId(selected: readonly number[], tagId: number): number[] {
  return selected.includes(tagId) ? selected.filter((id) => id !== tagId) : [...selected, tagId]
}

/** The `LIBRARY_LIST` filter fields; empty lists are left out. */
export function toLibraryFilter(selection: TagFilterSelection): {
  tagIds?: number[]
  categoryIds?: number[]
} {
  return {
    ...(selection.tagIds.length > 0 ? { tagIds: selection.tagIds } : {}),
    ...(selection.categoryIds.length > 0 ? { categoryIds: selection.categoryIds } : {})
  }
}

/**
 * Does a mockup pass the filter? Every picked tag must be on it (AND). A picked category counts
 * as all of its tags, so one tag from the category is enough, and categories AND together.
 */
export function matchesFilter(
  mockupTagIds: readonly number[],
  categoryTagIds: ReadonlyMap<number, readonly number[]>,
  selection: TagFilterSelection
): boolean {
  const has = new Set(mockupTagIds)
  if (!selection.tagIds.every((id) => has.has(id))) return false
  return selection.categoryIds.every((categoryId) =>
    (categoryTagIds.get(categoryId) ?? []).some((id) => has.has(id))
  )
}
