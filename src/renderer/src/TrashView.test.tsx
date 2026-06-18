import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TrashView from './TrashView'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from './stores/libraryStore'
import { useUiStore } from './stores/uiStore'

const mockTrashItem = {
  id: 7,
  title: 'Old Hero',
  description: null,
  coverPath: '/lib/old-hero.png',
  isGroup: false,
  favourite: false,
  reviewStatus: 'approved' as const,
  variantCount: 1,
  tags: [],
}

function setupApi(trashItems: typeof mockTrashItem[]) {
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.LIBRARY_TRASH_LIST)
        return { success: true, data: { items: trashItems } }
      if (channel === IPC_CHANNELS.LIBRARY_STATS)
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: trashItems.length } }
      if (channel === IPC_CHANNELS.MOCKUP_RESTORE)
        return { success: true, data: { ok: true } }
      if (channel === IPC_CHANNELS.MOCKUP_DELETE_PERMANENT)
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
  useUiStore.setState({ view: 'trash', modal: null })
  setupApi([])
})

describe('TrashView', () => {
  it('shows empty state when trash is empty', async () => {
    render(<TrashView />)
    expect(await screen.findByText('Trash is empty')).toBeTruthy()
  })

  it('shows trashed items by title', async () => {
    setupApi([mockTrashItem])
    render(<TrashView />)
    expect(await screen.findByText('Old Hero')).toBeTruthy()
  })

  it('Restore button calls MOCKUP_RESTORE', async () => {
    setupApi([mockTrashItem])
    render(<TrashView />)
    const restoreBtn = await screen.findByRole('button', { name: 'Restore Old Hero' })
    fireEvent.click(restoreBtn)
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_RESTORE, { mockupId: 7 })
    })
  })

  it('Delete permanently button opens ConfirmDialog and on confirm calls MOCKUP_DELETE_PERMANENT', async () => {
    setupApi([mockTrashItem])
    render(<TrashView />)
    const deleteBtn = await screen.findByRole('button', { name: 'Delete Old Hero permanently' })
    fireEvent.click(deleteBtn)
    // ConfirmDialog is rendered via uiStore modal — but TrashView renders standalone here
    // (no AppShell modal layer). Check the uiStore has a pending confirm modal.
    const modal = useUiStore.getState().modal
    expect(modal?.kind).toBe('confirm')
    // Trigger the confirm action directly
    if (modal?.kind === 'confirm') modal.onConfirm()
    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, {
        mockupId: 7,
      })
    })
  })
})
