import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DetailModal } from './DetailModal'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from './stores/libraryStore'

const mockDetail = {
  item: {
    id: 42,
    title: 'Hero Screen',
    description: 'The main hero mockup',
    coverPath: '/lib/hero.png',
    isGroup: false,
    favourite: false,
    reviewStatus: 'approved' as const,
    variantCount: 1,
    tags: [],
  },
  variants: [],
}

const mockGroupDetail = {
  item: {
    id: 99,
    title: 'Login Group',
    description: null,
    coverPath: '/lib/login.png',
    isGroup: true,
    favourite: false,
    reviewStatus: 'approved' as const,
    variantCount: 2,
    tags: [],
  },
  variants: [{ id: 100, title: 'Variant 1', coverPath: '/lib/login-v2.png' }],
}

function setupApi(overrides: Record<string, unknown> = {}) {
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string, payload: unknown) => {
      if (channel in overrides) return overrides[channel]
      if (channel === IPC_CHANNELS.MOCKUP_DETAIL) {
        const req = payload as { mockupId: number }
        if (req.mockupId === 99) return { success: true, data: mockGroupDetail }
        return { success: true, data: mockDetail }
      }
      if (channel === IPC_CHANNELS.TAG_LIST_BY_CATEGORY)
        return { success: true, data: { categories: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_LIST)
        return { success: true, data: { items: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_STATS)
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
      if (channel === IPC_CHANNELS.MOCKUP_UPDATE)
        return { success: true, data: { updated: true } }
      if (channel === IPC_CHANNELS.MOCKUP_TRASH)
        return { success: true, data: { ok: true } }
      if (channel === IPC_CHANNELS.GROUP_UNGROUP)
        return { success: true, data: { ungrouped: true } }
      if (channel === IPC_CHANNELS.GROUP_DELETE)
        return { success: true, data: { deleted: true } }
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
    stats: { total: 0, favourites: 0, groups: 0, trashed: 0 },
    isLoading: false,
    trash: [],
    selectedDetail: null,
  })
  setupApi()
})

describe('DetailModal', () => {
  it('renders title from MOCKUP_DETAIL response', async () => {
    render(<DetailModal mockupId={42} onClose={() => {}} />)
    const titleInput = await screen.findByRole('textbox', { name: 'Title' })
    expect((titleInput as HTMLInputElement).value).toBe('Hero Screen')
  })

  it('editing title and clicking Save calls MOCKUP_UPDATE with new title', async () => {
    render(<DetailModal mockupId={42} onClose={() => {}} />)
    const titleInput = await screen.findByRole('textbox', { name: 'Title' })
    fireEvent.change(titleInput, { target: { value: 'Updated Hero' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_UPDATE, {
        mockupId: 42,
        title: 'Updated Hero',
        description: 'The main hero mockup',
        tagIds: [],
      })
    })
  })

  it('clicking Move to Trash then Confirm calls MOCKUP_TRASH', async () => {
    const onClose = vi.fn()
    render(<DetailModal mockupId={42} onClose={onClose} />)
    await screen.findByRole('textbox', { name: 'Title' })
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_TRASH, { mockupId: 42 })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows group actions and Ungroup calls GROUP_UNGROUP after confirm', async () => {
    const onClose = vi.fn()
    render(<DetailModal mockupId={99} onClose={onClose} />)
    await screen.findByRole('textbox', { name: 'Title' })
    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.GROUP_UNGROUP, {
        leaderId: 99,
      })
    })
    expect(onClose).toHaveBeenCalled()
  })
})
