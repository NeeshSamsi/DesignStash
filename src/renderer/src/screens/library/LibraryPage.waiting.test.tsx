import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useWaitingStripStore } from '@renderer/stores/waitingStripStore'
import LibraryPage from './LibraryPage'
import { item, resetStores, setupApi } from './library-test-utils'

vi.mock('@renderer/stores/toastStore', () => ({ toast: vi.fn(), undoToast: vi.fn() }))

function mount(toSort: number) {
  setupApi([item(1)], {
    [IPC_CHANNELS.INBOX_COUNTS]: () => ({
      success: true,
      data: { toSort, toStash: 0, sniffing: 0, trash: 0 }
    }),
    [IPC_CHANNELS.INBOX_LIST]: () => ({ success: true, data: { items: [] } })
  })
  window.api.subscribe = vi.fn(() => () => {}) as unknown as typeof window.api.subscribe
}

const strip = () => document.querySelector('[data-ds="WaitingToSortStrip"]')

beforeEach(() => {
  resetStores()
  useWaitingStripStore.setState({ hiddenAt: null })
})

describe('LibraryPage waiting strip', () => {
  it('leads My Stash while To sort has anything', async () => {
    mount(4)
    render(<LibraryPage onSortWaiting={vi.fn()} />)
    expect(await screen.findByText('4 mockups waiting to be sorted')).toBeTruthy()
    const page = strip()!.parentElement!
    expect(page.firstElementChild).toBe(strip())
  })

  it('is not there when To sort is empty', async () => {
    mount(0)
    render(<LibraryPage onSortWaiting={vi.fn()} />)
    await waitFor(() =>
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS, undefined)
    )
    expect(strip()).toBeNull()
  })

  it('stays out of Starred, search results and filters', async () => {
    mount(4)
    const { rerender } = render(<LibraryPage onSortWaiting={vi.fn()} />)
    await screen.findByText('4 mockups waiting to be sorted')

    rerender(<LibraryPage starredOnly onSortWaiting={vi.fn()} />)
    expect(strip()).toBeNull()

    rerender(<LibraryPage onSortWaiting={vi.fn()} />)
    await screen.findByText('4 mockups waiting to be sorted')
    act(() => useLibraryStore.getState().setQuery('clay'))
    expect(strip()).toBeNull()
  })
})
