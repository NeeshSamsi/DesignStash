import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MockupTile from './MockupTile'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUiStore } from './stores/uiStore'
import type { LibraryItem } from '@shared/library'

const baseItem: LibraryItem = {
  id: 1,
  title: 'My Mockup',
  description: null,
  coverPath: '/covers/1.jpg',
  coverSource: 'embedded',
  coverMissing: false,
  isGroup: false,
  favourite: false,
  reviewStatus: 'approved',
  createdAt: '2025-01-01T00:00:00',
  variantCount: 1,
  topId: null,
  tags: [],
}

beforeEach(() => {
  useUiStore.setState({ view: 'library', modal: null })
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async () => ({ success: true, data: undefined })),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((f) => `/path/${(f as File).name}`),
  } as unknown as typeof window.api
})

describe('MockupTile', () => {
  it('renders the item title', () => {
    render(<MockupTile item={baseItem} onRefresh={vi.fn()} />)
    expect(screen.getByText('My Mockup')).toBeTruthy()
  })

  it('shows +N badge for group items (variantCount - 1)', () => {
    const groupItem: LibraryItem = { ...baseItem, isGroup: true, variantCount: 3 }
    render(<MockupTile item={groupItem} onRefresh={vi.fn()} />)
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('does not show +N badge for non-group items', () => {
    render(<MockupTile item={baseItem} onRefresh={vi.fn()} />)
    expect(screen.queryByText(/^\+\d/)).toBeNull()
  })

  it('clicking favourite button calls MOCKUP_SET_FAVOURITE', async () => {
    const onRefresh = vi.fn()
    render(<MockupTile item={baseItem} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle favourite' }))
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, {
      mockupId: 1,
      favourite: true,
    })
  })

  it('clicking tile body opens detail modal', () => {
    render(<MockupTile item={baseItem} onRefresh={vi.fn()} />)
    // Click the tile wrapper (not a button)
    const tile = screen.getByText('My Mockup').closest('.group') as HTMLElement
    fireEvent.click(tile)
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 1 })
  })

  it('clicking Zoom opens preview modal', () => {
    render(<MockupTile item={baseItem} onRefresh={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom preview' }))
    expect(useUiStore.getState().modal).toEqual({
      kind: 'preview',
      coverPath: 'file:///covers/1.jpg',
    })
  })
})
