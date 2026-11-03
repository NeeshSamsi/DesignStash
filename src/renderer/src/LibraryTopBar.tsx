import { useEffect, useRef, useState, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TagsByCategory } from '@shared/approval'
import { useLibraryStore } from './stores/libraryStore'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'

export default function LibraryTopBar() {
  const query = useLibraryStore((s) => s.query)
  const setQuery = useLibraryStore((s) => s.setQuery)
  const sort = useLibraryStore((s) => s.sort)
  const setSort = useLibraryStore((s) => s.setSort)
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const setTagFilter = useLibraryStore((s) => s.setTagFilter)
  const stats = useLibraryStore((s) => s.stats)

  const [categories, setCategories] = useState<TagsByCategory[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  // Controlled input — separate from store.query so user sees immediate feedback
  const [inputValue, setInputValue] = useState(query)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Load filter options once on mount
  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, undefined)
      if (res.success) setCategories(res.data.categories ?? [])
    })()
  }, [])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setInputValue(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => setQuery(value), 250)
    },
    [setQuery]
  )

  const handleTagToggle = useCallback(
    (tagId: number) => {
      setTagFilter(
        tagFilter.includes(tagId) ? tagFilter.filter((id) => id !== tagId) : [...tagFilter, tagId]
      )
    },
    [tagFilter, setTagFilter]
  )

  const clearFilter = useCallback(() => setTagFilter([]), [setTagFilter])

  return (
    <div className="relative flex flex-wrap items-center gap-3 px-4 py-2">
      {/* Search */}
      <Input
        className="w-52"
        placeholder="Search…"
        value={inputValue}
        onChange={handleSearchChange}
        aria-label="Search mockups"
      />

      {/* Filter */}
      <div className="relative">
        <Button
          variant={tagFilter.length > 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterOpen((v) => !v)}
          aria-expanded={filterOpen}
          aria-label="Filter by tags"
        >
          Filter
          {tagFilter.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {tagFilter.length}
            </Badge>
          )}
        </Button>

        {filterOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Tags</span>
              {tagFilter.length > 0 && (
                <Button variant="ghost" size="xs" onClick={clearFilter}>
                  Clear all
                </Button>
              )}
            </div>
            {categories.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">No tags yet</p>
            )}
            {categories.map((cat) => (
              <div key={cat.categoryId}>
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {cat.categoryLabel}
                </p>
                {cat.tags.map((tag) => (
                  <label
                    key={tag.tagId}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={tagFilter.includes(tag.tagId)}
                      onChange={() => handleTagToggle(tag.tagId)}
                      className="rounded accent-primary"
                    />
                    <span className="text-sm text-foreground">{tag.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sort — native select (kept for accessible form semantics), tokenized */}
      <select
        className="rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        value={sort}
        onChange={(e) => setSort(e.target.value as 'date' | 'name')}
        aria-label="Sort order"
      >
        <option value="date">Date added</option>
        <option value="name">Name</option>
      </select>

      {/* Stats */}
      <div className="ml-auto hidden gap-3 text-xs text-muted-foreground sm:flex">
        <span>{stats.total} items</span>
        {stats.favourites > 0 && <span>{stats.favourites} favourites</span>}
        {stats.groups > 0 && <span>{stats.groups} groups</span>}
      </div>
    </div>
  )
}
