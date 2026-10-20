import { create } from 'zustand'
import type { LibraryItem, LibraryStats, MockupDetail } from '@shared/library'

interface LibraryState {
  items: LibraryItem[]
  trash: LibraryItem[]
  stats: LibraryStats
  tagFilter: number[]
  /** Categories picked as a whole (“All in Device”). */
  categoryIds: number[]
  query: string
  sort: 'date' | 'name'
  selectedDetail: MockupDetail | null
  isLoading: boolean
  /** The last list each view loaded (by search, filter, sort and view), shown at once on return. */
  cache: Record<string, LibraryItem[]>

  setItems(items: LibraryItem[]): void
  setTrash(trash: LibraryItem[]): void
  setStats(stats: LibraryStats): void
  setTagFilter(tagFilter: number[]): void
  setCategoryIds(categoryIds: number[]): void
  setQuery(query: string): void
  setSort(sort: 'date' | 'name'): void
  setDetail(detail: MockupDetail | null): void
  setLoading(isLoading: boolean): void
  cacheList(key: string, items: LibraryItem[]): void
  reset(): void
}

const emptyStats: LibraryStats = { total: 0, favourites: 0, groups: 0, trashed: 0 }

export const useLibraryStore = create<LibraryState>((set) => ({
  items: [],
  trash: [],
  stats: emptyStats,
  tagFilter: [],
  categoryIds: [],
  query: '',
  sort: 'date',
  selectedDetail: null,
  isLoading: false,
  cache: {},

  setItems: (items) => set({ items }),
  setTrash: (trash) => set({ trash }),
  setStats: (stats) => set({ stats }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
  setCategoryIds: (categoryIds) => set({ categoryIds }),
  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setDetail: (selectedDetail) => set({ selectedDetail }),
  setLoading: (isLoading) => set({ isLoading }),
  cacheList: (key, items) => set((state) => ({ cache: { ...state.cache, [key]: items } })),
  reset: () =>
    set({
      items: [],
      trash: [],
      stats: emptyStats,
      tagFilter: [],
      categoryIds: [],
      query: '',
      sort: 'date',
      selectedDetail: null,
      isLoading: false,
      cache: {}
    })
}))
