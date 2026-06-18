import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LibraryTopBar from './LibraryTopBar'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from './stores/libraryStore'

const mockCategories = [
  {
    categoryId: 1,
    categoryLabel: 'Style',
    tags: [
      { tagId: 10, label: 'Minimal', parentTagId: null },
      { tagId: 11, label: 'Bold', parentTagId: null },
    ],
  },
]

function setupApiMock() {
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.TAG_LIST_BY_CATEGORY) {
        return { success: true, data: { categories: mockCategories } }
      }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) {
        return { success: true, data: { items: [] } }
      }
      return { success: true, data: {} }
    }),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((f) => `/path/${(f as File).name}`),
  } as unknown as typeof window.api
}

beforeEach(() => {
  useLibraryStore.setState({
    items: [],
    query: '',
    tagFilter: [],
    sort: 'date',
    stats: { total: 5, favourites: 2, groups: 1, trashed: 0 },
    isLoading: false,
    trash: [],
    selectedDetail: null,
  })
  setupApiMock()
})

describe('LibraryTopBar', () => {
  it('renders search input, filter button, and sort select', () => {
    render(<LibraryTopBar />)
    expect(screen.getByRole('textbox', { name: 'Search mockups' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Filter/i })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Sort order' })).toBeTruthy()
  })

  it('shows stats from the library store', () => {
    render(<LibraryTopBar />)
    expect(screen.getByText('5 items')).toBeTruthy()
  })

  it('changing sort updates store.sort immediately', () => {
    render(<LibraryTopBar />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort order' }), {
      target: { value: 'name' },
    })
    expect(useLibraryStore.getState().sort).toBe('name')
  })

  it('clicking a tag label adds tagId to store.tagFilter', async () => {
    render(<LibraryTopBar />)
    // Open filter panel
    fireEvent.click(screen.getByRole('button', { name: /Filter/i }))
    // Wait for categories to load via async invoke
    const checkbox = await screen.findByLabelText('Minimal')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(useLibraryStore.getState().tagFilter).toContain(10)
    })
  })

  describe('debounced search', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('typing in search updates store.query only after 250ms', () => {
      render(<LibraryTopBar />)
      const input = screen.getByRole('textbox', { name: 'Search mockups' })
      fireEvent.change(input, { target: { value: 'hero' } })
      // Before debounce fires, store.query is unchanged
      expect(useLibraryStore.getState().query).toBe('')
      // Advance past debounce threshold
      vi.advanceTimersByTime(250)
      expect(useLibraryStore.getState().query).toBe('hero')
    })
  })
})
