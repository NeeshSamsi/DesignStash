import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DndContextProps } from '@dnd-kit/core'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  TO_SORT_BOARD,
  type GroupMember,
  type GroupingProposal,
  type SortBoard
} from '@shared/grouping'
import { useShortcutDispatcher } from '@renderer/lib/shortcuts'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { SortFlow } from './SortFlow'

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

// Figma B2 · Sort into piles. Behaviour is in board-model.test.ts; this checks the screen draws and wires it.

const member = (id: number, fileName: string, folder: string[] = []): GroupMember => ({
  mockupId: id,
  fileName,
  folderTrail: folder,
  coverPath: `/c/${id}.png`,
  isPrimary: false
})

const proposal = (overrides: Partial<GroupingProposal> = {}): GroupingProposal => ({
  batchId: TO_SORT_BOARD,
  groups: [
    {
      id: 'phones',
      members: [1, 2, 3, 4].map((i) => ({
        ...member(i, `phone_${i}.psd`, ['Phones']),
        isPrimary: i === 1
      })),
      reason: 'folder'
    },
    {
      id: 'mugs',
      members: [5, 6, 7].map((i) => ({ ...member(i, `mug_${i}.psd`), isPrimary: i === 5 })),
      reason: 'stem'
    }
  ],
  singletons: [8, 9, 10].map((i) => member(i, `solo_${i}.psd`)),
  ...overrides
})

interface Api {
  invoke: ReturnType<typeof vi.fn>
  calls: (channel: string) => unknown[]
}

function setupApi(
  options: {
    proposal?: GroupingProposal
    saved?: SortBoard | null
    proposeFails?: boolean
    saveFails?: boolean
  } = {}
): Api {
  const invoke = vi.fn<(channel: string, request?: unknown) => Promise<unknown>>(
    async (channel) => {
      if (channel === IPC_CHANNELS.GROUPING_PROPOSE) {
        return options.proposeFails
          ? { success: false, error: { code: 'X', message: 'x' } }
          : { success: true, data: options.proposal ?? proposal() }
      }
      if (channel === IPC_CHANNELS.SORT_BOARD_LOAD) {
        return { success: true, data: { board: options.saved ?? null } }
      }
      if (channel === IPC_CHANNELS.SORT_BOARD_SAVE && options.saveFails) {
        return { success: false, error: { code: 'X', message: 'x' } }
      }
      if (channel === IPC_CHANNELS.SORT_BOARD_SAVE) return { success: true, data: { saved: true } }
      if (channel === IPC_CHANNELS.GROUPING_CONFIRM)
        return { success: true, data: { confirmed: true } }
      return { success: true, data: {} }
    }
  )
  window.api = { appName: 'DesignStash', invoke } as unknown as typeof window.api
  return {
    invoke,
    calls: (channel) => invoke.mock.calls.filter(([c]) => c === channel).map(([, r]) => r)
  }
}

function ShortcutHost({ children }: { children: ReactNode }) {
  useShortcutDispatcher()
  return <>{children}</>
}

function mount(props: Partial<React.ComponentProps<typeof SortFlow>> = {}) {
  const onClose = vi.fn()
  const onLookThemOver = vi.fn()
  render(
    <ShortcutHost>
      <SortFlow open onClose={onClose} onLookThemOver={onLookThemOver} {...props} />
    </ShortcutHost>
  )
  return { onClose, onLookThemOver }
}

const board = () => document.querySelector('[data-ds="SortBoard"]') as HTMLElement
const ready = () => screen.findByRole('application', { name: 'Sort board' })
const tile = (id: number) => document.querySelector<HTMLElement>(`[data-tile-id="${id}"]`)!
const pile = (id: string) => document.querySelector<HTMLElement>(`[data-pile-id="${id}"]`)!
const header = (id: string) => pile(id).querySelector<HTMLElement>('[data-handle]')!
const tileIds = (el: Element) =>
  [...el.querySelectorAll<HTMLElement>('[data-tile-id]')].map((t) => Number(t.dataset.tileId))
const tray = () => document.querySelector<HTMLElement>('[data-tray]')!
const pileIds = () =>
  [...document.querySelectorAll<HTMLElement>('[data-pile-id]')].map((p) => p.dataset.pileId)
const key = (name: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(board(), { key: name, ...init })

const dragStart = (id: string) => act(() => dnd.props!.onDragStart!({ active: { id } } as never))
const dragOver = (id: string | null) =>
  act(() => dnd.props!.onDragOver!({ over: id === null ? null : { id } } as never))
const dragEnd = (active: string, over: string | null) =>
  act(() =>
    dnd.props!.onDragEnd!({
      active: { id: active },
      over: over === null ? null : { id: over }
    } as never)
  )

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(undoToast).mockClear()
})

describe('opening the board (S1)', () => {
  it('shows a skeleton while it loads, never a spinner', async () => {
    setupApi()
    mount()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull()
    await ready()
  })

  it('shows the suggested piles with their titles, the tray and the count in the step header (S1.1)', async () => {
    setupApi()
    mount()
    await ready()
    expect(pileIds()).toEqual(['phones', 'mugs'])
    expect(within(pile('phones')).getByText('Phones')).toBeTruthy()
    expect(within(pile('phones')).getByText('4 mockups')).toBeTruthy()
    expect(within(pile('mugs')).getByText('mug_…')).toBeTruthy()
    expect(within(pile('mugs')).getByText('similar names')).toBeTruthy()
    expect(tileIds(tray())).toEqual([8, 9, 10])
    expect(within(tray()).getByText('On its own')).toBeTruthy()
    expect(screen.getByText('10 mockups')).toBeTruthy()
  })

  it('marks each pile’s first tile as Top, never "Primary" or "leader" (S3.E1 copy)', async () => {
    setupApi()
    mount()
    await ready()
    expect(within(pile('phones')).getAllByText('Top')).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/primary|leader|confidence/i)
  })

  it('shows the board even when nothing pairs up (S1.E2, S1.E3)', async () => {
    setupApi({ proposal: proposal({ groups: [], singletons: [member(1, 'a.psd')] }) })
    mount()
    await ready()
    expect(pileIds()).toEqual([])
    expect(tileIds(tray())).toEqual([1])
    expect(screen.getByText('1 mockup')).toBeTruthy()
  })

  it('says it is still copying when it is (S1.E1)', async () => {
    setupApi()
    mount({ copying: true })
    await ready()
    expect(screen.getByText('Still copying')).toBeTruthy()
  })

  it('opens with the board the user left, not a fresh suggestion (Finish later)', async () => {
    setupApi({
      saved: {
        batchId: TO_SORT_BOARD,
        groups: [{ id: 'mine', memberIds: [9, 8] }],
        singletonIds: [1, 2, 3, 4, 5, 6, 7, 10]
      }
    })
    mount()
    await ready()
    expect(pileIds()).toEqual(['mine'])
    expect(tileIds(pile('mine'))).toEqual([9, 8])
    expect(toast).not.toHaveBeenCalled()
  })

  it('still opens when suggesting failed, with a toast and Try again (S1.E5)', async () => {
    const api = setupApi({
      proposal: proposal({
        groups: [],
        suggestionFailed: true,
        singletons: [1, 2, 3].map((i) => member(i, `f${i}.psd`))
      })
    })
    mount()
    await ready()
    expect(tileIds(tray())).toEqual([1, 2, 3])
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    const options = vi.mocked(toast).mock.calls[0]![0] as unknown as {
      message: string
      action: { label: string; onClick: () => void }
    }
    expect(options.message).toBe('Couldn’t suggest piles. You can still sort them by hand.')
    expect(options.action.label).toBe('Try again')
    api.invoke.mockClear()
    act(() => options.action.onClick())
    await waitFor(() => expect(api.calls(IPC_CHANNELS.GROUPING_PROPOSE)).toHaveLength(1))
  })

  it('offers Try again when it can’t open at all, in plain words', async () => {
    setupApi({ proposeFails: true })
    mount()
    expect(await screen.findByText('Couldn’t open these')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/[A-Z_]{4,}|\/Users/)
  })
})

describe('selection and menus', () => {
  it('click selects a tile, ⌘-click adds, click on empty space clears (S2.1, S2.2, S2.E4)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(tile(8))
    expect(tile(8).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(tile(9), { metaKey: true })
    expect(tile(8).getAttribute('aria-selected')).toBe('true')
    expect(tile(9).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(board())
    expect(tile(8).getAttribute('aria-selected')).toBeNull()
  })

  it('⇧-click selects a range inside a pile (S2.3)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(tile(2))
    fireEvent.click(tile(4), { shiftKey: true })
    expect([2, 3, 4].every((id) => tile(id).getAttribute('aria-selected') === 'true')).toBe(true)
    expect(tile(1).getAttribute('aria-selected')).toBeNull()
  })

  it('clicking a pile header selects the pile (S7.1)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(header('mugs'))
    expect(pile('mugs').getAttribute('aria-selected')).toBe('true')
  })

  it('⌘A selects every tile (S2.E3)', async () => {
    setupApi()
    mount()
    await ready()
    key('a', { metaKey: true })
    expect(document.querySelectorAll('[data-tile-id][aria-selected="true"]')).toHaveLength(10)
  })

  it('⌘G makes a pile of the selection, first selected on top, with an Undo toast (S5.3, S5.4)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(tile(9))
    fireEvent.click(tile(10), { metaKey: true })
    key('g', { metaKey: true })
    expect(pileIds()[0]).not.toBe('phones')
    const made = document.querySelector<HTMLElement>('[data-pile-id]')!
    expect(tileIds(made)).toEqual([9, 10])
    expect(within(made).getByText('solo_9.psd')).toBeTruthy()
    expect(vi.mocked(undoToast).mock.calls[0]![0]).toBe('New pile of 2 mockups.')
    expect(tileIds(tray())).toEqual([8])
  })

  it('says how to make a pile, and offers Make pile once two or more are selected', async () => {
    setupApi()
    mount()
    await ready()
    expect(
      screen.getByText('Drag mockups together to make a pile. Leave the rest on their own.')
    ).toBeTruthy()
    fireEvent.click(tile(9))
    expect(screen.queryByRole('button', { name: 'Make pile' })).toBeNull()
    fireEvent.click(tile(10), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Make pile' }))
    const made = document.querySelector<HTMLElement>('[data-pile-id]')!
    expect(tileIds(made)).toEqual([9, 10])
    expect(vi.mocked(undoToast).mock.calls[0]![0]).toBe('New pile of 2 mockups.')
  })

  it('does nothing for ⌘G on one tile', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(tile(9))
    key('g', { metaKey: true })
    expect(pileIds()).toEqual(['phones', 'mugs'])
    expect(undoToast).not.toHaveBeenCalled()
  })

  it('⇧⌘G disbands the selected pile and ⌘Z brings it back (S8.E2, S8.E1)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(header('mugs'))
    key('g', { metaKey: true, shiftKey: true })
    expect(pileIds()).toEqual(['phones'])
    expect(tileIds(tray())).toEqual([8, 9, 10, 5, 6, 7])
    key('z', { metaKey: true })
    expect(pileIds()).toEqual(['phones', 'mugs'])
  })

  it('the toast’s Undo undoes the change', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(header('mugs'))
    key('g', { metaKey: true, shiftKey: true })
    const undo = vi.mocked(undoToast).mock.calls[0]![1]
    act(() => undo())
    expect(pileIds()).toEqual(['phones', 'mugs'])
  })

  it('right-clicking a tile opens its menu with Put on top, Move to and Take out (S4.1)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.contextMenu(tile(3))
    const rows = (await screen.findAllByRole('menuitem')).map((r) => r.textContent)
    expect(rows.join('|')).toMatch(/Put on top.*Move to.*Take out of pile.*New pile/)
    expect(tile(3).getAttribute('aria-selected')).toBe('true')
  })

  it('Put on top from the menu moves the tile to the front and titles follow (S6.1, S6.2)', async () => {
    setupApi({
      proposal: proposal({ groups: [], singletons: [member(1, 'a.psd'), member(2, 'b.psd')] })
    })
    mount()
    await ready()
    fireEvent.click(tile(1))
    fireEvent.click(tile(2), { metaKey: true })
    key('g', { metaKey: true })
    const made = document.querySelector<HTMLElement>('[data-pile-id]')!
    expect(within(made).getByText('a.psd', { selector: 'p' })).toBeTruthy()
    // Right-clicking inside a selection keeps it, so pick the one tile first.
    fireEvent.click(tile(2))
    fireEvent.contextMenu(tile(2))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Put on top/ }))
    expect(
      within(document.querySelector<HTMLElement>('[data-pile-id]')!).getByText('b.psd', {
        selector: 'p'
      })
    ).toBeTruthy()
  })

  it('right-clicking a pile offers Select all, Merge into and Disband (S4.E3)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.contextMenu(header('mugs'))
    const rows = (await screen.findAllByRole('menuitem')).map((r) => r.textContent ?? '')
    expect(rows.map((r) => r.replace(/⇧⌘G/, ''))).toEqual([
      'Select all in pile',
      'Merge into',
      'Disband pile'
    ])
  })

  it('right-clicking empty space offers Select all and Undo (S4.E4)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.contextMenu(board())
    const rows = (await screen.findAllByRole('menuitem')).map((r) => r.textContent ?? '')
    expect(rows.map((r) => r.replace(/[⌘A-Z]+$/, ''))).toEqual([
      'Select all',
      'Undo · nothing to undo'
    ])
  })

  it('a greyed-out row says why, in its own words (F-047)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.contextMenu(tile(3))
    const newPile = await screen.findByRole('menuitem', { name: /New pile/ })
    expect(
      newPile.getAttribute('aria-disabled') ?? newPile.getAttribute('data-disabled')
    ).not.toBeNull()
    expect(newPile.textContent).toContain('New pile · needs 2 or more')
  })

  it('the ⋯ on a tile opens the same menu (S4.E1)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(within(tile(8)).getByRole('button', { name: /More actions for solo_8/ }))
    expect(await screen.findByRole('menuitem', { name: /Move to/ })).toBeTruthy()
  })
})

describe('drag and drop (S3, S5, S7, S8)', () => {
  it('shows a ghost where a tile will land, and the pile highlighted (S3.2)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('tile:8')
    dragOver('pile:mugs')
    expect(pile('mugs').getAttribute('data-state')).toBe('drag-over')
    expect(
      within(pile('mugs')).getAllByText('', { selector: '[data-state="drop-ghost"]' }).length
    ).toBeGreaterThan(0)
    expect(tile(8).getAttribute('data-state')).toBe('left-behind')
  })

  it('dropping on a pile adds the tile at the end with an Undo toast (S3.3)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('tile:8')
    dragEnd('tile:8', 'pile:mugs')
    expect(tileIds(pile('mugs'))).toEqual([5, 6, 7, 8])
    expect(tileIds(tray())).toEqual([9, 10])
    expect(vi.mocked(undoToast).mock.calls[0]![0]).toMatch(/^Added 1 mockup to /)
  })

  it('dropping on a tile on its own starts a pile led by that tile, shown first (S5.1, S5.2)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('tile:8')
    dragOver('tile:9')
    expect(tile(9).getAttribute('data-state')).toBe('pile-target')
    dragEnd('tile:8', 'tile:9')
    const made = document.querySelector<HTMLElement>('[data-pile-id]')!
    expect(made.dataset.pileId).not.toBe('phones')
    expect(tileIds(made)).toEqual([9, 8])
  })

  it('grabbing a selected tile carries the whole selection (S3.4, S3.6)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(tile(8))
    fireEvent.click(tile(9), { metaKey: true })
    dragStart('tile:8')
    dragEnd('tile:8', 'pile:phones')
    expect(tileIds(pile('phones'))).toEqual([1, 2, 3, 4, 8, 9])
    expect(tile(8).getAttribute('aria-selected')).toBe('true')
  })

  it('dropping outside any target sends it back: nothing moves (S3.E5)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('tile:8')
    dragEnd('tile:8', null)
    expect(tileIds(tray())).toEqual([8, 9, 10])
    expect(undoToast).not.toHaveBeenCalled()
  })

  it('cancelling a drag leaves the board as it was (S3.E5)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('tile:8')
    act(() => dnd.props!.onDragCancel!({} as never))
    expect(tile(8).getAttribute('data-state')).not.toBe('left-behind')
    expect(tileIds(tray())).toEqual([8, 9, 10])
  })

  it('taking the top out names the new top in the toast (S3.E1)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('tile:1')
    dragEnd('tile:1', 'tray')
    expect(vi.mocked(undoToast).mock.calls[0]![0]).toContain('phone_2.psd is now the top mockup')
  })

  it('a pile down to one tile dissolves into On its own (S3.E2)', async () => {
    setupApi({
      proposal: proposal({ groups: [proposal().groups[1]!], singletons: [member(8, 'x.psd')] })
    })
    mount()
    await ready()
    fireEvent.click(tile(5))
    fireEvent.click(tile(6), { metaKey: true })
    dragStart('tile:5')
    dragEnd('tile:5', 'tray')
    expect(pileIds()).toEqual([])
    expect(tileIds(tray())).toEqual([8, 5, 6, 7])
  })

  it('dragging a pile by its header onto another merges them (S7.2 to S7.4)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('pile:phones')
    dragOver('pile:mugs')
    expect(pile('mugs').getAttribute('data-state')).toBe('merge-target')
    dragEnd('pile:phones', 'pile:mugs')
    expect(pileIds()).toEqual(['mugs'])
    expect(tileIds(pile('mugs'))).toEqual([5, 6, 7, 1, 2, 3, 4])
  })

  it('dropping a pile on On its own disbands it (S8.E3)', async () => {
    setupApi()
    mount()
    await ready()
    dragStart('pile:mugs')
    dragEnd('pile:mugs', 'tray')
    expect(pileIds()).toEqual(['phones'])
    expect(tileIds(tray())).toEqual([8, 9, 10, 5, 6, 7])
  })
})

describe('leaving', () => {
  it('Finish later always confirms, says what is kept, and saves the board (I3.E2)', async () => {
    const api = setupApi()
    const { onClose } = mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Finish later' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Your haul isn’t stashed yet')).toBeTruthy()
    expect(
      within(dialog).getByText(
        'Your piles so far are kept. All 10 mockups wait in To sort until you come back.'
      )
    ).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish later' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(api.calls(IPC_CHANNELS.SORT_BOARD_SAVE)).toEqual([
      {
        batchId: TO_SORT_BOARD,
        groups: [
          { id: 'phones', memberIds: [1, 2, 3, 4] },
          { id: 'mugs', memberIds: [5, 6, 7] }
        ],
        singletonIds: [8, 9, 10]
      }
    ])
    expect(api.calls(IPC_CHANNELS.GROUPING_CONFIRM)).toHaveLength(0)
  })

  it('Keep going closes the question and keeps the board', async () => {
    const api = setupApi()
    const { onClose } = mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Finish later' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep going' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(api.calls(IPC_CHANNELS.SORT_BOARD_SAVE)).toHaveLength(0)
  })

  it('stays open and says so when saving fails', async () => {
    setupApi({ saveFails: true })
    const { onClose } = mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Finish later' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Finish later' })
    )
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(vi.mocked(toast).mock.calls.at(-1)![0]).toMatchObject({
      variant: 'error',
      message: 'Couldn’t save your piles. Try again.'
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc puts down a selection first, then asks about leaving (S2.E4, S3.E5)', async () => {
    setupApi()
    mount()
    await ready()
    fireEvent.click(tile(8))
    fireEvent.keyDown(document.activeElement ?? board(), { key: 'Escape' })
    await waitFor(() => expect(tile(8).getAttribute('aria-selected')).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.keyDown(document.activeElement ?? board(), { key: 'Escape' })
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
  })

  it('Look them over saves the piles with each top first, then hands them on', async () => {
    const api = setupApi()
    const { onClose, onLookThemOver } = mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Look them over' }))
    await waitFor(() => expect(onLookThemOver).toHaveBeenCalled())
    expect(api.calls(IPC_CHANNELS.GROUPING_CONFIRM)).toEqual([
      {
        batchId: TO_SORT_BOARD,
        groups: [
          { id: 'phones', memberIds: [1, 2, 3, 4] },
          { id: 'mugs', memberIds: [5, 6, 7] }
        ],
        singletonIds: [8, 9, 10]
      }
    ])
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open and says so when confirming fails', async () => {
    const api = setupApi()
    api.invoke.mockImplementation(async (channel) => {
      if (channel === IPC_CHANNELS.GROUPING_PROPOSE) return { success: true, data: proposal() }
      if (channel === IPC_CHANNELS.SORT_BOARD_LOAD) return { success: true, data: { board: null } }
      return { success: false, error: { code: 'X', message: 'x' } }
    })
    const { onLookThemOver } = mount()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Look them over' }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(onLookThemOver).not.toHaveBeenCalled()
  })

  describe('Sort 3: a board of just the cards picked (F-049)', () => {
    const only = { kind: 'only', mockupIds: [2, 3, 8] } as const

    it('shows just those three, with the piles cut to them', async () => {
      setupApi()
      mount({ scope: only })
      await ready()
      expect(pileIds()).toEqual(['phones'])
      expect(tileIds(pile('phones'))).toEqual([2, 3])
      expect(screen.getByText('3 mockups')).toBeTruthy()
    })

    it('Look them over confirms just those three', async () => {
      const api = setupApi()
      const { onLookThemOver } = mount({ scope: only })
      await ready()
      fireEvent.click(screen.getByRole('button', { name: 'Look them over' }))
      await waitFor(() => expect(onLookThemOver).toHaveBeenCalled())
      expect(api.calls(IPC_CHANNELS.GROUPING_CONFIRM)).toEqual([
        { batchId: TO_SORT_BOARD, groups: [{ id: 'phones', memberIds: [2, 3] }], singletonIds: [8] }
      ])
    })

    it('Finish later keeps the rest of the board around them', async () => {
      const api = setupApi()
      const { onClose } = mount({ scope: only })
      await ready()
      fireEvent.click(screen.getByRole('button', { name: 'Finish later' }))
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Finish later' })
      )
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(api.calls(IPC_CHANNELS.SORT_BOARD_SAVE)).toEqual([
        {
          batchId: TO_SORT_BOARD,
          groups: [
            { id: 'phones', memberIds: [1, 4] },
            { id: 'mugs', memberIds: [5, 6, 7] },
            { id: expect.any(String), memberIds: [2, 3] }
          ],
          singletonIds: [9, 10, 8]
        }
      ])
    })
  })

  describe('the board by keyboard alone (F-046)', () => {
    const press = (name: string, init: KeyboardEventInit = {}) =>
      fireEvent.keyDown(document.activeElement ?? board(), { key: name, ...init })
    const focused = () => (document.activeElement as HTMLElement | null)?.dataset.tileId

    it('arrows walk the tiles, piles first, and only the one under the cursor takes Tab', async () => {
      setupApi()
      mount()
      await ready()
      press('ArrowRight')
      expect(focused()).toBe('1')
      press('ArrowRight')
      expect(focused()).toBe('2')
      press('ArrowLeft')
      expect(focused()).toBe('1')
      const tabStops = [...document.querySelectorAll<HTMLElement>('[data-tile-id][tabindex="0"]')]
      expect(tabStops.map((t) => t.dataset.tileId)).toEqual(['1'])
    })

    it('Space picks two tiles and ⌘G piles them', async () => {
      setupApi()
      mount()
      await ready()
      press('ArrowRight')
      for (let i = 0; i < 7; i++) press('ArrowRight')
      expect(focused()).toBe('8')
      press(' ')
      press('ArrowRight')
      press(' ')
      expect(tile(8).getAttribute('aria-selected')).toBe('true')
      expect(tile(9).getAttribute('aria-selected')).toBe('true')
      press('g', { metaKey: true })
      expect(pileIds()).toHaveLength(3)
    })

    it('the menu key opens the tile’s menu: Put on top, then Move to another pile', async () => {
      setupApi()
      mount()
      await ready()
      press('ArrowRight')
      press('ArrowRight')
      expect(focused()).toBe('2')
      press('F10', { shiftKey: true })
      fireEvent.keyDown(await screen.findByRole('menuitem', { name: /Put on top/ }), {
        key: 'Enter'
      })
      await waitFor(() => expect(tileIds(pile('phones'))[0]).toBe(2))
      await waitFor(() => expect(focused()).toBe('2'))

      press('ContextMenu')
      fireEvent.keyDown(await screen.findByRole('menuitem', { name: /Move to/ }), {
        key: 'ArrowRight'
      })
      fireEvent.keyDown(await screen.findByRole('menuitem', { name: /mug/ }), { key: 'Enter' })
      await waitFor(() => expect(tileIds(pile('mugs'))).toContain(2))
      expect(tileIds(pile('phones'))).not.toContain(2)
    })
  })

  it('renders nothing when closed', () => {
    setupApi()
    render(<SortFlow open={false} onClose={vi.fn()} onLookThemOver={vi.fn()} />)
    expect(document.querySelector('[data-ds="FlowModal"]')).toBeNull()
  })
})
