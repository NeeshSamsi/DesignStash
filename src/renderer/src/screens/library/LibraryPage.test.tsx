import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
import LibraryPage from './LibraryPage'
import { item, resetStores, setupApi } from './library-test-utils'

vi.mock('@renderer/stores/toastStore', () => ({ toast: vi.fn(), undoToast: vi.fn() }))

const cards = (root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>('[data-ds="MockupCard"][data-mockup-id]')]
const titles = () => cards().map((card) => card.getAttribute('data-mockup-id'))

async function ready() {
  await waitFor(() => expect(document.querySelector('[data-ds="MockupGrid"]')?.getAttribute('data-state')).not.toBe('loading'))
}

beforeEach(() => {
  resetStores()
  vi.mocked(toast).mockClear()
  vi.mocked(undoToast).mockClear()
})

describe('LibraryPage grid', () => {
  it('shows the Add card straight away, then the mockups', async () => {
    setupApi([item(1), item(2)])
    render(<LibraryPage />)
    expect(document.querySelector('[data-ds="AddMockupCard"]')).not.toBeNull()
    await ready()
    expect(titles()).toEqual(['1', '2'])
  })

  it('shows ten skeleton cards and no spinner while loading', () => {
    setupApi([])
    useLibraryStore.setState({ items: [] })
    render(<LibraryPage />)
    const grid = document.querySelector('[data-ds="MockupGrid"]')!
    expect(grid.getAttribute('data-state')).toBe('loading')
    expect(grid.querySelectorAll('[data-ds="MockupCard"][aria-busy="true"]')).toHaveLength(10)
    expect(grid.querySelector('[data-slot="spinner"]')).toBeNull()
  })

  it('an empty library is just the Add card, top-left, with no centred page', async () => {
    setupApi([])
    render(<LibraryPage />)
    await ready()
    expect(document.querySelector('[data-ds="MockupGrid"]')!.getAttribute('data-state')).toBe('empty')
    expect(document.querySelector('[data-ds="AddMockupCard"]')).not.toBeNull()
    expect(document.querySelector('[data-ds="EmptyState"]')).toBeNull()
  })

  it('shows the Add card first in My Stash › All only (not in search, filter or Starred)', async () => {
    setupApi([item(1, { favourite: true })])
    const { rerender } = render(<LibraryPage starredOnly={false} />)
    await ready()
    const grid = document.querySelector('[data-ds="MockupGrid"]')!
    expect(grid.querySelector('[data-ds="AddMockupCard"]')).not.toBeNull()
    expect(grid.firstElementChild!.firstElementChild!.getAttribute('data-ds')).toBe('AddMockupCard')

    rerender(<LibraryPage starredOnly />)
    await ready()
    expect(document.querySelector('[data-ds="AddMockupCard"]')).toBeNull()

    rerender(<LibraryPage starredOnly={false} />)
    await ready()
    expect(document.querySelector('[data-ds="AddMockupCard"]')).not.toBeNull()
    act(() => useLibraryStore.getState().setQuery('clay'))
    await ready()
    expect(document.querySelector('[data-ds="AddMockupCard"]')).toBeNull()
    act(() => useLibraryStore.getState().setQuery(''))
    act(() => useLibraryStore.getState().setTagFilter([5]))
    await ready()
    expect(document.querySelector('[data-ds="AddMockupCard"]')).toBeNull()
  })

  it('opens the Add menu from the Add card on click', async () => {
    const onAddFiles = vi.fn()
    setupApi([item(1)])
    render(<LibraryPage onAddFiles={onAddFiles} onAddFolder={vi.fn()} />)
    await ready()
    fireEvent.pointerDown(document.querySelector<HTMLElement>('[data-ds="AddMockupCard"]')!, {
      button: 0,
      ctrlKey: false
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Add files/ }))
    expect(onAddFiles).toHaveBeenCalledTimes(1)
  })

  it('opens the Add menu from the Add card on Enter', async () => {
    const onAddFolder = vi.fn()
    setupApi([item(1)])
    render(<LibraryPage onAddFiles={vi.fn()} onAddFolder={onAddFolder} />)
    await ready()
    fireEvent.keyDown(document.querySelector<HTMLElement>('[data-ds="AddMockupCard"]')!, {
      key: 'Enter'
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Add folder/ }))
    expect(onAddFolder).toHaveBeenCalledTimes(1)
  })

  it('never selects the Add card', async () => {
    setupApi([item(1)])
    render(<LibraryPage />)
    await ready()
    fireEvent.click(document.querySelector('[data-ds="AddMockupCard"]')!)
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('selects with a click and reports it in the toolbar', async () => {
    setupApi([item(1), item(2), item(3)])
    render(<LibraryPage />)
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[2]!, { metaKey: true })
    expect(screen.getByText('2 of 3 selected')).toBeTruthy()
  })
})

describe('LibraryPage requests', () => {
  it('asks for the date sort by default and for the name sort when chosen', async () => {
    const api = setupApi([item(1)])
    render(<LibraryPage />)
    await ready()
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).at(-1)).toMatchObject({ sort: 'date' })
    act(() => useLibraryStore.getState().setSort('name'))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).at(-1)).toMatchObject({ sort: 'name' }))
  })

  it('sorts by date added (newest first) by default, or by name', async () => {
    const api = setupApi([item(1)])
    render(<LibraryPage />)
    await ready()
    expect(useLibraryStore.getState().sort).toBe('date')
    expect(screen.getByRole('combobox', { name: 'Sort order' }).textContent).toContain('Date added')
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST)[0]).not.toHaveProperty('starredOnly')
  })

  it('passes search, tags, whole categories and the Starred view to the list', async () => {
    const api = setupApi([item(1, { favourite: true })])
    useLibraryStore.setState({ query: 'phone', tagFilter: [3], categoryIds: [7] })
    render(<LibraryPage starredOnly />)
    await ready()
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).at(-1)).toEqual({
      tagIds: [3],
      categoryIds: [7],
      query: 'phone',
      starredOnly: true,
      sort: 'date'
    })
  })

  it('reads the Starred view from the UI store when no prop is given', async () => {
    const api = setupApi([item(1, { favourite: true })])
    useUiStore.setState({ view: 'starred' })
    render(<LibraryPage />)
    await ready()
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).at(-1)).toMatchObject({ starredOnly: true })
  })
})

describe('LibraryPage states', () => {
  it('no results repeats the query and offers Clear search, which clears it', async () => {
    setupApi([])
    useLibraryStore.setState({ query: 'clay' })
    render(<LibraryPage />)
    await ready()
    expect(screen.getByText('No mockups match “clay”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(useLibraryStore.getState().query).toBe('')
  })

  it('offers Clear filters, or Clear search and filters, depending on what is active', async () => {
    setupApi([])
    useLibraryStore.setState({ tagFilter: [1], categoryIds: [2] })
    const { unmount } = render(<LibraryPage />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(useLibraryStore.getState().tagFilter).toEqual([])
    expect(useLibraryStore.getState().categoryIds).toEqual([])
    unmount()

    useLibraryStore.setState({ query: 'x', tagFilter: [1], categoryIds: [] })
    render(<LibraryPage />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(useLibraryStore.getState().query).toBe('')
    expect(useLibraryStore.getState().tagFilter).toEqual([])
  })

  it('nothing starred yet explains how to star, with no button', async () => {
    setupApi([item(1)])
    render(<LibraryPage starredOnly />)
    await ready()
    expect(screen.getByText('Nothing starred yet')).toBeTruthy()
    expect(within(document.querySelector('[data-ds="EmptyState"]')!).queryByRole('button')).toBeNull()
  })

  it('keeps no-results and error states at the top under the toolbar', async () => {
    setupApi([])
    useLibraryStore.setState({ query: 'x' })
    render(<LibraryPage />)
    await ready()
    const toolbar = document.querySelector('[data-ds="LibraryToolbar"]')!
    const grid = document.querySelector('[data-ds="MockupGrid"]')!
    expect(toolbar.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(grid.className).not.toMatch(/justify-center|h-full|my-auto/)
    expect(document.querySelector('[data-ds="LibraryToolbar"]')).not.toBeNull()
  })

  it('the toolbar still shows at zero items', async () => {
    setupApi([])
    render(<LibraryPage />)
    await ready()
    expect(screen.getByText('0 items')).toBeTruthy()
  })

  it('a failed first load shows the error state with a retry', async () => {
    let fail = true
    const api = setupApi([item(1)], {
      [IPC_CHANNELS.LIBRARY_LIST]: () =>
        fail
          ? { success: false, error: { code: 'LIBRARY_LIST', message: 'busy' } }
          : { success: true, data: { items: [item(1)] } }
    })
    render(<LibraryPage />)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(document.body.textContent).not.toMatch(/LIBRARY_LIST|busy/)
    fail = false
    fireEvent.click(retry)
    await waitFor(() => expect(titles()).toEqual(['1']))
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).length).toBeGreaterThan(1)
  })

  it('a failed refresh keeps the last grid and shows a Banner (C1.E1)', async () => {
    let fail = false
    setupApi([item(1), item(2)], {
      [IPC_CHANNELS.LIBRARY_LIST]: () =>
        fail
          ? { success: false, error: { code: 'LIBRARY_LIST', message: 'busy' } }
          : { success: true, data: { items: [item(1), item(2)] } }
    })
    render(<LibraryPage />)
    await ready()
    fail = true
    act(() => useLibraryStore.getState().setSort('name'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Couldn’t refresh your stash')).toBeTruthy()
    expect(titles()).toEqual(['1', '2'])
  })
})

describe('LibraryPage stars', () => {
  it('stars from the card and updates the count', async () => {
    const api = setupApi([item(1)], {
      [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: () => ({ success: true, data: { favourite: true } })
    })
    render(<LibraryPage />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Star Mockup 1/ }))
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.MOCKUP_SET_FAVOURITE)).toEqual([{ mockupId: 1, favourite: true }])
    )
    expect(useLibraryStore.getState().items[0]!.favourite).toBe(true)
  })

  it('keeps an unstarred card in Starred until the view is left, with Undo', async () => {
    const starred = [item(1, { favourite: true }), item(2, { favourite: true })]
    const api = setupApi(starred, {
      [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: (request) => {
        const { mockupId, favourite } = request as { mockupId: number; favourite: boolean }
        starred.find((i) => i.id === mockupId)!.favourite = favourite
        return { success: true, data: { favourite } }
      },
      [IPC_CHANNELS.LIBRARY_LIST]: () => ({
        success: true,
        data: { items: starred.filter((i) => i.favourite) }
      })
    })
    const { rerender } = render(<LibraryPage starredOnly />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Remove star from Mockup 1/ }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.MOCKUP_SET_FAVOURITE)).toHaveLength(1))
    expect(undoToast).toHaveBeenCalledWith('Removed from Starred', expect.any(Function), undefined)
    // The list is refetched (say, a sort change): the card is still there, unstarred.
    act(() => useLibraryStore.getState().setSort('name'))
    await ready()
    await waitFor(() => expect(titles()).toEqual(['1', '2']))
    expect(
      within(cards()[0]!).getByRole('button', { name: /Star Mockup 1/ })
    ).toBeTruthy()
    // Leaving Starred drops it.
    rerender(<LibraryPage starredOnly={false} />)
    await ready()
    rerender(<LibraryPage starredOnly />)
    await ready()
    await waitFor(() => expect(titles()).toEqual(['2']))
  })

  it('Undo on the Starred toast stars it again', async () => {
    const starred = [item(1, { favourite: true })]
    const api = setupApi(starred, {
      [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: (request) => {
        const { mockupId, favourite } = request as { mockupId: number; favourite: boolean }
        starred.find((i) => i.id === mockupId)!.favourite = favourite
        return { success: true, data: { favourite } }
      },
      [IPC_CHANNELS.LIBRARY_LIST]: () => ({ success: true, data: { items: starred.filter((i) => i.favourite) } })
    })
    render(<LibraryPage starredOnly />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Remove star from Mockup 1/ }))
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1))
    const undo = vi.mocked(undoToast).mock.calls[0]![1]
    await act(async () => undo())
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.MOCKUP_SET_FAVOURITE).at(-1)).toEqual({ mockupId: 1, favourite: true })
    )
    expect(useLibraryStore.getState().items[0]!.favourite).toBe(true)
  })

  it('a failed star puts it back and says so', async () => {
    setupApi([item(1)], {
      [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: () => ({ success: false, error: { code: 'X', message: 'no' } })
    })
    render(<LibraryPage />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Star Mockup 1/ }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(useLibraryStore.getState().items[0]!.favourite).toBe(false)
  })

  it('in All, unstarring shows no toast', async () => {
    setupApi([item(1, { favourite: true })])
    render(<LibraryPage />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Remove star from Mockup 1/ }))
    await waitFor(() => expect(useLibraryStore.getState().items[0]!.favourite).toBe(false))
    expect(undoToast).not.toHaveBeenCalled()
  })
})

describe('LibraryPage detail', () => {
  it('opens Detail on double-click, not on a single click', async () => {
    setupApi([item(4)])
    render(<LibraryPage />)
    await ready()
    fireEvent.click(cards()[0]!)
    expect(useUiStore.getState().modal).toBeNull()
    fireEvent.doubleClick(cards()[0]!)
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 4 })
  })

  it('Edit details on the card opens Detail', async () => {
    setupApi([item(4)])
    render(<LibraryPage />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Edit details' }))
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 4 })
  })

  it('Open in Photoshop on the card asks the main process, and explains a failure', async () => {
    const api = setupApi([item(4)], {
      [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: () => ({
        success: true,
        data: { opened: false, reason: 'no-app' }
      })
    })
    render(<LibraryPage />)
    await ready()
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Open in Photoshop' }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)).toEqual([{ mockupId: 4 }]))
  })

  it('shows Open in Photoshop and Edit details along the cover on hover; Edit details opens Detail', async () => {
    setupApi([item(9)])
    render(<LibraryPage />)
    await ready()
    const card = cards()[0]!
    expect(within(card).getByRole('button', { name: 'Open in Photoshop' })).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Edit details' }))
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 9 })
  })
})

describe('LibraryPage and Detail', () => {
  it('reloads when Detail says something changed', async () => {
    const api = setupApi([item(1)])
    render(<LibraryPage />)
    await ready()
    const before = api.calls(IPC_CHANNELS.LIBRARY_LIST).length
    act(() => useDetailEffects.getState().notifyChanged())
    await waitFor(() => expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).length).toBe(before + 1))
  })

  it('selects the mockups Detail asked for once the grid has reloaded', async () => {
    const all = [item(1), item(2), item(3)]
    setupApi(all)
    render(<LibraryPage />)
    await ready()
    act(() => {
      useDetailEffects.getState().selectAfterReload([2, 3])
      useLibraryStore.getState().setItems([...all])
    })
    await waitFor(() => expect(screen.getByText('2 of 3 selected')).toBeTruthy())
    expect(useDetailEffects.getState().pendingSelection).toEqual([])
  })
})
