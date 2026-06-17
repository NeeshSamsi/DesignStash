import { create } from 'zustand'
import type { LibraryItem, LibraryStats, MockupDetail } from '@shared/library'

interface LibraryState {
  items: LibraryItem[]
  trash: LibraryItem[]
  stats: LibraryStats
  tagFilter: number[]
  query: string
  sort: 'date' | 'name'
  selectedDetail: MockupDetail | null
  isLoading: boolean

  setItems(items: LibraryItem[]): void
  setTrash(trash: LibraryItem[]): void
  setStats(stats: LibraryStats): void
  setTagFilter(tagFilter: number[]): void
  setQuery(query: string): void
  setSort(sort: 'date' | 'name'): void
  setDetail(detail: MockupDetail | null): void
  setLoading(isLoading: boolean): void
  reset(): void
}

const emptyStats: LibraryStats = { total: 0, favourites: 0, groups: 0, trashed: 0 }

export const useLibraryStore = create<LibraryState>((set) => ({
  items: [],
  trash: [],
  stats: emptyStats,
  tagFilter: [],
  query: '',
  sort: 'date',
  selectedDetail: null,
  isLoading: false,

  setItems: (items) => set({ items }),
  setTrash: (trash) => set({ trash }),
  setStats: (stats) => set({ stats }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setDetail: (selectedDetail) => set({ selectedDetail }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ items: [], trash: [], stats: emptyStats, tagFilter: [], query: '', sort: 'date', selectedDetail: null, isLoading: false })
}))
