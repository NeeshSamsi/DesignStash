import { useEffect, useRef, useState, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TagsByCategory } from '@shared/approval'
import { useLibraryStore } from './stores/libraryStore'

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
    <div className="flex items-center gap-3 px-4 py-2 flex-wrap relative">
      {/* Search */}
      <input
        className="bg-neutral-700 border border-neutral-600 px-3 py-1.5 rounded-lg text-sm text-slate-100 placeholder-neutral-500 w-52 focus:outline-none focus:border-brand-500 transition-colors"
        placeholder="Search…"
        value={inputValue}
        onChange={handleSearchChange}
        aria-label="Search mockups"
      />

      {/* Filter */}
      <div className="relative">
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
            tagFilter.length > 0
              ? 'bg-brand-500/20 border-brand-500/60 text-brand-500'
              : 'bg-neutral-700 border-neutral-600 text-slate-200 hover:bg-neutral-600'
          }`}
          aria-expanded={filterOpen}
          aria-label="Filter by tags"
        >
          Filter
          {tagFilter.length > 0 && (
            <span className="text-xs bg-brand-500 text-white rounded-full px-1.5 leading-tight">
              {tagFilter.length}
            </span>
          )}
        </button>

        {filterOpen && (
          <div className="absolute top-full left-0 mt-1 z-30 bg-neutral-800 border border-neutral-700 rounded-xl shadow-xl w-56 max-h-72 overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
              <span className="text-xs font-medium text-neutral-400">Tags</span>
              {tagFilter.length > 0 && (
                <button
                  onClick={clearFilter}
                  className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            {categories.length === 0 && (
              <p className="px-3 py-3 text-xs text-neutral-500">No tags yet</p>
            )}
            {categories.map((cat) => (
              <div key={cat.categoryId}>
                <p className="px-3 py-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  {cat.categoryLabel}
                </p>
                {cat.tags.map((tag) => (
                  <label
                    key={tag.tagId}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={tagFilter.includes(tag.tagId)}
                      onChange={() => handleTagToggle(tag.tagId)}
                      className="accent-brand-500 rounded"
                    />
                    <span className="text-sm text-slate-200">{tag.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sort */}
      <select
        className="bg-neutral-700 border border-neutral-600 px-2 py-1.5 rounded-lg text-sm text-slate-100 focus:outline-none transition-colors"
        value={sort}
        onChange={(e) => setSort(e.target.value as 'date' | 'name')}
        aria-label="Sort order"
      >
        <option value="date">Date added</option>
        <option value="name">Name</option>
      </select>

      {/* Stats */}
      <div className="ml-auto text-xs text-neutral-500 hidden sm:flex gap-3">
        <span>{stats.total} items</span>
        {stats.favourites > 0 && <span>{stats.favourites} favourites</span>}
        {stats.groups > 0 && <span>{stats.groups} groups</span>}
      </div>
    </div>
  )
}
