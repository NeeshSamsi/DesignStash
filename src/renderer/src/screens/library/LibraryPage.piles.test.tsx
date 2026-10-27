import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DndContextProps } from '@dnd-kit/core'
import { IPC_CHANNELS } from '@shared/ipc'
import { toast, undoToast } from '@renderer/stores/toastStore'
import LibraryPage from './LibraryPage'
import { item, pile, resetStores, setupApi, ShortcutHost } from './library-test-utils'

vi.mock('@renderer/stores/toastStore', () => ({ toast: vi.fn(), undoToast: vi.fn() }))

// dnd-kit's pointer sensor needs real pointer events; drive its callbacks directly instead.
const dnd = vi.hoisted(() => ({ props: null as DndContextProps | null }))
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      dnd.props = props
      return <>{props.children}</>
    }
  }
})

const cards = () => [
  ...document.querySelectorAll<HTMLElement>('[data-ds="MockupCard"][data-mockup-id]')
]
const snapshot = (...ids: number[]) => ({
  rows: ids.map((id) => ({ id, isGroup: false, groupId: null }))
})

async function ready() {
  await waitFor(() =>
    expect(document.querySelector('[data-ds="MockupGrid"]')?.getAttribute('data-state')).not.toBe(
      'loading'
    )
  )
}

function page() {
  return render(
    <ShortcutHost>
      <LibraryPage />
    </ShortcutHost>
  )
}

const drag = (activeId: number) =>
  act(() => dnd.props!.onDragStart!({ active: { id: String(activeId) } } as never))
const over = (overId: number | null) =>
  act(() =>
    dnd.props!.onDragOver!({ over: overId === null ? null : { id: String(overId) } } as never)
  )
const drop = (activeId: number, overId: number | null) =>
  act(() =>
    dnd.props!.onDragEnd!({
      active: { id: String(activeId) },
      over: overId === null ? null : { id: String(overId) }
    } as never)
  )

const pileOk = (pileId = 2, ids = [1, 2]) => ({
  success: true,
  data: { pileId, snapshot: snapshot(...ids) }
})

beforeEach(() => {
  resetStores()
  vi.mocked(toast).mockClear()
  vi.mocked(undoToast).mockClear()
})

describe('piles by shortcut', () => {
  it('makes a pile from the selection with Cmd+G, first selected on top, undoable', async () => {
    const api = setupApi([item(1), item(2), item(3)], {
      [IPC_CHANNELS.PILE_CREATE]: () => pileOk(1, [1, 2, 3]),
      [IPC_CHANNELS.PILE_RESTORE]: () => ({ success: true, data: { restoredIds: [1, 2, 3] } })
    })
    page()
    await ready()
    fireEvent.click(cards()[1]!)
    fireEvent.click(cards()[2]!, { metaKey: true })
    fireEvent.click(cards()[0]!, { metaKey: true })
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'g', metaKey: true })
    await waitFor(() => expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toHaveLength(1))
    // Selected in grid order (1, 2, 3): the first selected card is on top.
    expect(api.calls(IPC_CHANNELS.PILE_CREATE)[0]).toEqual({ memberIds: [1, 2, 3], topId: 1 })
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1))
    expect(vi.mocked(undoToast).mock.calls[0]!.slice(0, 1)).toEqual(['Pile made'])
    await act(async () => vi.mocked(undoToast).mock.calls[0]![1]())
    expect(api.calls(IPC_CHANNELS.PILE_RESTORE)).toEqual([{ snapshot: snapshot(1, 2, 3) }])
  })

  it('needs two or more', async () => {
    const api = setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'g', metaKey: true })
    expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toHaveLength(0)
  })

  it('New pile from N in the menu does the same', async () => {
    const api = setupApi([item(1), item(2)], { [IPC_CHANNELS.PILE_CREATE]: () => pileOk(1) })
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /New pile from 2 mockups/ }))
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toEqual([{ memberIds: [1, 2], topId: 1 }])
    )
  })

  it('a failed pile says so and offers no Undo', async () => {
    setupApi([item(1), item(2)], {
      [IPC_CHANNELS.PILE_CREATE]: () => ({ success: false, error: { code: 'X', message: 'no' } })
    })
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'g', metaKey: true })
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(undoToast).not.toHaveBeenCalled()
  })

  it('disbands a pile instantly with Shift+Cmd+G, leaving the mockups selected', async () => {
    let disbanded = false
    const api = setupApi(
      [],
      {
        [IPC_CHANNELS.LIBRARY_LIST]: () => ({
          success: true,
          data: { items: disbanded ? [item(1), item(11)] : [pile(1, 1), item(2)] }
        }),
        [IPC_CHANNELS.PILE_DISBAND]: () => {
          disbanded = true
          return { success: true, data: { snapshot: snapshot(1, 11), freedIds: [1, 11] } }
        },
        [IPC_CHANNELS.PILE_RESTORE]: () => ({ success: true, data: { restoredIds: [1, 11] } })
      },
      { total: 2, favourites: 0, groups: 0, trashed: 0 }
    )
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'g', metaKey: true, shiftKey: true })
    await waitFor(() => expect(api.calls(IPC_CHANNELS.PILE_DISBAND)).toEqual([{ pileIds: [1] }]))
    await waitFor(() => expect(screen.getByText('2 of 2 selected')).toBeTruthy())
    expect(undoToast).toHaveBeenCalledWith(
      'Pile disbanded',
      expect.any(Function),
      '2 mockups are on their own',
      undefined
    )
    await act(async () => vi.mocked(undoToast).mock.calls[0]![1]())
    expect(api.calls(IPC_CHANNELS.PILE_RESTORE)).toEqual([{ snapshot: snapshot(1, 11) }])
  })

  it('Disband pile in the menu works too, and does nothing on a single mockup', async () => {
    const api = setupApi([pile(1), item(2)], {
      [IPC_CHANNELS.PILE_DISBAND]: () => ({
        success: true,
        data: { snapshot: snapshot(1), freedIds: [1] }
      })
    })
    page()
    await ready()
    fireEvent.click(cards()[1]!)
    cards()[1]!.focus()
    fireEvent.keyDown(cards()[1]!, { key: 'g', metaKey: true, shiftKey: true })
    expect(api.calls(IPC_CHANNELS.PILE_DISBAND)).toHaveLength(0)
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Disband pile/ }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.PILE_DISBAND)).toEqual([{ pileIds: [1] }]))
  })
})

describe('piles by drag', () => {
  it('makes a pile by dropping a card or selection on a card (target goes on top) or with Cmd+G, undoable', async () => {
    const api = setupApi([item(1), item(2)], {
      [IPC_CHANNELS.PILE_CREATE]: () => pileOk(2),
      [IPC_CHANNELS.PILE_RESTORE]: () => ({ success: true, data: { restoredIds: [1, 2] } })
    })
    page()
    await ready()
    drag(1)
    over(2)
    drop(1, 2)
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toEqual([{ memberIds: [2, 1], topId: 2 }])
    )
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1))
    await act(async () => vi.mocked(undoToast).mock.calls[0]![1]())
    expect(api.calls(IPC_CHANNELS.PILE_RESTORE)).toHaveLength(1)
  })

  it('the target shows “Start a pile” while a card is over it, and the dragged card leaves a slot', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    drag(1)
    over(2)
    expect(screen.getByText('Start a pile')).toBeTruthy()
    expect(cards()[0]!.getAttribute('data-state')).not.toBe('selected')
    expect(cards()[0]!.className).toBeTruthy()
    drop(1, null)
    await waitFor(() => expect(screen.queryByText('Start a pile')).toBeNull())
  })

  it('dragging a selection carries all of it and shows the pile size', async () => {
    const api = setupApi([item(1), item(2), item(3), item(4)], {
      [IPC_CHANNELS.PILE_CREATE]: () => pileOk(2, [1, 2, 3, 4])
    })
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[2]!, { metaKey: true })
    fireEvent.click(cards()[3]!, { metaKey: true })
    drag(3)
    over(2)
    expect(screen.getByText('New pile from 4 mockups')).toBeTruthy()
    drop(3, 2)
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toEqual([{ memberIds: [2, 1, 3, 4], topId: 2 }])
    )
  })

  it('dragging a card outside the selection carries just that card', async () => {
    const api = setupApi([item(1), item(2), item(3)], {
      [IPC_CHANNELS.PILE_CREATE]: () => pileOk(2)
    })
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    drag(3)
    drop(3, 1)
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toEqual([{ memberIds: [1, 3], topId: 1 }])
    )
  })

  it('adds to or merges into a pile when dropped on one', async () => {
    const api = setupApi([pile(1), pile(2), item(3)], {
      [IPC_CHANNELS.PILE_ADD]: () => pileOk(1),
      [IPC_CHANNELS.PILE_MERGE]: () => pileOk(1)
    })
    page()
    await ready()
    drag(3)
    over(1)
    expect(screen.getByText('Add to this pile')).toBeTruthy()
    drop(3, 1)
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_ADD)).toEqual([{ pileId: 1, memberIds: [3] }])
    )
    drag(2)
    over(1)
    expect(screen.getByText('Merge into this pile')).toBeTruthy()
    drop(2, 1)
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_MERGE)).toEqual([{ sourceIds: [2], targetId: 1 }])
    )
  })

  it('adds to or merges into a pile when dropped on one', async () => {
    const api = setupApi([pile(1), item(2)], { [IPC_CHANNELS.PILE_ADD]: () => pileOk(1) })
    page()
    await ready()
    drag(2)
    drop(2, 1)
    await waitFor(() => expect(api.calls(IPC_CHANNELS.PILE_ADD)).toHaveLength(1))
  })

  it('dropping on empty space, on itself or cancelling does nothing', async () => {
    const api = setupApi([item(1), item(2)])
    page()
    await ready()
    drag(1)
    drop(1, null)
    drag(1)
    drop(1, 1)
    drag(1)
    over(2)
    act(() => dnd.props!.onDragCancel!({} as never))
    expect(screen.queryByText('Start a pile')).toBeNull()
    expect(api.calls(IPC_CHANNELS.PILE_CREATE)).toHaveLength(0)
  })
})
