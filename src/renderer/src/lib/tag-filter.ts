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
  /** Mockups with any of the category's tags: the count on its “All in …” row. */
  mockupCount?: number
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

/**
 * Ticks or unticks “All in <category>”. Ticking drops the category's own picked tags, because the
 * category already covers them; unticking leaves the tags as they are (none, by then).
 */
export function toggleCategory(
  selection: TagFilterSelection,
  categoryId: number,
  categoryTagIds: readonly number[]
): TagFilterSelection {
  if (selection.categoryIds.includes(categoryId)) {
    return { ...selection, categoryIds: selection.categoryIds.filter((id) => id !== categoryId) }
  }
  const covered = new Set(categoryTagIds)
  return {
    tagIds: selection.tagIds.filter((id) => !covered.has(id)),
    categoryIds: [...selection.categoryIds, categoryId]
  }
}

export interface FilterChip {
  key: string
  /** The category beside a tag's label; absent on an “All in …” chip. */
  category?: string
  label: string
  onRemove: () => void
}

/** One chip per picked category (“All in Device”), then one per picked tag. */
export function filterChips(
  categories: readonly FilterCategory[],
  selection: TagFilterSelection,
  handlers: { onRemoveTag: (tagId: number) => void; onRemoveCategory: (categoryId: number) => void }
): FilterChip[] {
  const chips: FilterChip[] = []
  for (const categoryId of selection.categoryIds) {
    const category = categories.find((c) => c.categoryId === categoryId)
    if (!category) continue
    chips.push({
      key: `category-${categoryId}`,
      label: `All in ${category.categoryLabel}`,
      onRemove: () => handlers.onRemoveCategory(categoryId)
    })
  }
  for (const tagId of selection.tagIds) {
    for (const category of categories) {
      const tag = category.tags.find((t) => t.tagId === tagId)
      if (!tag) continue
      chips.push({
        key: `tag-${tagId}`,
        category: category.categoryLabel,
        label: tag.label,
        onRemove: () => handlers.onRemoveTag(tagId)
      })
      break
    }
  }
  return chips
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
