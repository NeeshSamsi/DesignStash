import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxItem, TrashItem } from '@shared/inbox'
import { doneMessage } from '@renderer/lib/inbox-list'
import { useHeaderSlot } from '@renderer/lib/page-header-slot'
import { useInboxStore } from '@renderer/stores/inboxStore'
import { item } from '../library/library-test-utils'
import InboxPage from './InboxPage'
import TrashPage from '../trash/TrashPage'

// The behaviour in design/specs/inboxes.md.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const inbox = (id: number, over: Partial<InboxItem> = {}): InboxItem => ({
  ...item(id),
  title: `file-${id}.psd`,
  stage: 'to_sort',
  aiStatus: 'ready',
  sizeBytes: 1024,
  batchId: 'batch-1',
  ...over
})

const trashed = (id: number, over: Partial<TrashItem> = {}): TrashItem => ({
  ...item(id),
  trashedAt: `2026-10-${String(10 + id).padStart(2, '0')}T12:00:00Z`,
  sizeBytes: 2048,
  ...over
})

type Handler = (request: unknown) => unknown
let pushes: Map<string, (payload: unknown) => void>
const invoke = vi.fn()
const sent = (channel: string) => invoke.mock.calls.filter(([c]) => c === channel).map(([, r]) => r)

function setup(handlers: Record<string, Handler>) {
  pushes = new Map()
  invoke.mockReset()
  invoke.mockImplementation(async (channel: string, request: unknown) => {
    const handler = handlers[channel]
    return handler ? handler(request) : { success: true, data: {} }
  })
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      pushes.set(channel, cb)
      return () => pushes.delete(channel)
    })
  } as unknown as typeof window.api
}
const push = (channel: string, payload: unknown) => act(() => pushes.get(channel)?.(payload))
const ok = (data: unknown) => ({ success: true, data })

const listOf = (items: InboxItem[]) => ({ [IPC_CHANNELS.INBOX_LIST]: () => ok({ items }) })
const card = (id: number) => document.querySelector<HTMLElement>(`[data-mockup-id="${id}"]`)!

beforeEach(() => {
  useInboxStore.getState().reset()
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
})

describe('inboxes: shared grid', () => {
  it('selects like My Stash: click, ⌘-click, ⇧-click, ⌘A and Esc', async () => {
    setup(listOf([1, 2, 3, 4].map((id) => inbox(id))))
    render(<InboxPage stage="to_sort" />)
    await screen.findByText('file-1.psd')
    const selected = () =>
      [1, 2, 3, 4].filter(
        (id) =>
          card(id).getAttribute('data-state') === 'selected' || card(id).ariaSelected === 'true'
      )
    fireEvent.click(card(2))
    expect(selected()).toEqual([2])
    fireEvent.click(card(4), { metaKey: true })
    expect(selected()).toEqual([2, 4])
    fireEvent.click(card(1))
    fireEvent.click(card(3), { shiftKey: true })
    expect(selected()).toEqual([1, 2, 3])
    fireEvent.keyDown(card(3), { key: 'a', metaKey: true })
    expect(selected()).toEqual([1, 2, 3, 4])
    fireEvent.keyDown(card(3), { key: 'Escape' })
    expect(selected()).toEqual([])
  })

  it('the action bar names the selection', async () => {
    setup(
      listOf([
        inbox(1, { stage: 'to_stash' }),
        inbox(2, { stage: 'to_stash' }),
        inbox(3, { stage: 'to_stash' })
      ])
    )
    render(<InboxPage stage="to_stash" />)
    await screen.findByText('file-1.psd')
    expect(screen.getByRole('button', { name: 'Look them over' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toss these' })).toBeTruthy()
    fireEvent.click(card(1))
    fireEvent.click(card(2), { metaKey: true })
    expect(screen.getByRole('button', { name: 'Look over 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toss 2' })).toBeTruthy()
  })
})

describe('To sort', () => {
  it('shows singles with their file names', async () => {
    setup(listOf([inbox(1), inbox(2)]))
    render(<InboxPage stage="to_sort" />)
    expect(await screen.findByText('file-1.psd')).toBeTruthy()
    expect(screen.getByText('file-2.psd')).toBeTruthy()
    expect(screen.queryByText(/^\+\d/)).toBeNull()
  })

  it('badges only the cards still pending or sniffing', async () => {
    setup(
      listOf([
        inbox(1, { aiStatus: 'ready' }),
        inbox(2, { aiStatus: 'sniffing' }),
        inbox(3, { aiStatus: 'pending' })
      ])
    )
    render(<InboxPage stage="to_sort" />)
    await screen.findByText('file-1.psd')
    expect(screen.getAllByText('Sniffing…')).toHaveLength(2)
    expect(card(1).textContent).not.toContain('Sniffing…')
  })

  it('reads "Still sniffing 7 of 38" from the ai:status push, then "AI suggestions ready for all 38"', async () => {
    setup(listOf([inbox(1, { aiStatus: 'sniffing' }), inbox(2)]))
    render(<InboxPage stage="to_sort" />)
    await screen.findByText('file-1.psd')
    push(IPC_CHANNELS.AI_STATUS, { updates: [], totals: { total: 38, remaining: 7 } })
    expect(useHeaderSlot.getState().status).toBe('Still sniffing 7 of 38')
    push(IPC_CHANNELS.AI_STATUS, {
      updates: [{ mockupId: 1, status: 'ready' }],
      totals: { total: 38, remaining: 0 }
    })
    expect(useHeaderSlot.getState().status).toBe('AI suggestions ready for all 38')
    expect(screen.queryByText('Sniffing…')).toBeNull()
  })

  it('Sort hands the selection, or everything, to the grouping review', async () => {
    setup(listOf([inbox(1), inbox(2), inbox(3)]))
    const onSort = vi.fn()
    render(<InboxPage stage="to_sort" onSort={onSort} />)
    await screen.findByText('file-1.psd')
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    expect(onSort.mock.calls[0]?.[0].map((i: InboxItem) => i.id)).toEqual([1, 2, 3])
    fireEvent.click(card(2))
    fireEvent.click(screen.getByRole('button', { name: 'Sort 1' }))
    expect(onSort.mock.calls[1]?.[0].map((i: InboxItem) => i.id)).toEqual([2])
  })

  it('refetches when main says the counts changed', async () => {
    setup(listOf([inbox(1)]))
    render(<InboxPage stage="to_sort" />)
    await screen.findByText('file-1.psd')
    const before = sent(IPC_CHANNELS.INBOX_LIST).length
    push(IPC_CHANNELS.INBOX_COUNTS_CHANGED, { toSort: 1, toStash: 0, sniffing: 0, trash: 0 })
    await waitFor(() => expect(sent(IPC_CHANNELS.INBOX_LIST).length).toBe(before + 1))
  })
})

describe('To stash', () => {
  const stash = [
    inbox(1, { stage: 'to_stash', isGroup: true, variantCount: 3, title: 'Clay pile' }),
    inbox(2, { stage: 'to_stash', title: 'Single' })
  ]

  it('shows piles with +N and no status badge', async () => {
    setup(listOf(stash))
    render(<InboxPage stage="to_stash" />)
    await screen.findByText('Clay pile')
    expect(card(1).textContent).toContain('4')
    expect(card(2).textContent).not.toContain('Sniffing…')
  })

  it('hover offers "Look it over", which opens that card', async () => {
    setup(listOf(stash))
    const onLookOver = vi.fn()
    render(<InboxPage stage="to_stash" onLookOver={onLookOver} />)
    await screen.findByText('Clay pile')
    fireEvent.click(card(1).querySelector('button')!)
    expect(onLookOver.mock.calls[0]?.[0].map((i: InboxItem) => i.id)).toEqual([1])
  })

  it('Look them over hands everything to the approval stepper', async () => {
    setup(listOf(stash))
    const onLookOver = vi.fn()
    render(<InboxPage stage="to_stash" onLookOver={onLookOver} />)
    await screen.findByText('Clay pile')
    fireEvent.click(screen.getByRole('button', { name: 'Look them over' }))
    expect(onLookOver.mock.calls[0]?.[0].map((i: InboxItem) => i.id)).toEqual([1, 2])
  })

  it('Toss these asks, then sends INBOX_TOSS with the ids', async () => {
    setup({
      ...listOf(stash),
      [IPC_CHANNELS.INBOX_TOSS]: () => ok({ tossedIds: [1, 2], skippedIds: [] })
    })
    render(<InboxPage stage="to_stash" />)
    await screen.findByText('Clay pile')
    fireEvent.click(screen.getByRole('button', { name: 'Toss these' }))
    expect(sent(IPC_CHANNELS.INBOX_TOSS)).toEqual([])
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Toss these?')
    expect(dialog.textContent).toContain(
      'This deletes the 2 sorted mockups and their PSDs from your stash folder. Your originals stay right where they are.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Toss these' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard 2 mockups' }))
    await waitFor(() => expect(sent(IPC_CHANNELS.INBOX_TOSS)).toEqual([{ ids: [1, 2] }]))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
  })

  it('tells an empty page what it is for', async () => {
    setup(listOf([]))
    render(<InboxPage stage="to_stash" />)
    expect(await screen.findByText('Nothing waiting to be stashed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Look them over' })).toBeNull()
  })
})

describe('Add card', () => {
  it.each(['to_sort', 'to_stash'] as const)('%s starts with the Add mockup card', async (stage) => {
    setup(listOf([inbox(1, { stage })]))
    render(<InboxPage stage={stage} onAddFiles={vi.fn()} onAddFolder={vi.fn()} />)
    await screen.findByText('file-1.psd')
    const grid = document.querySelector('[data-ds="MockupGrid"]')!
    expect(grid.textContent).toContain('Add mockup')
    expect(grid.textContent).toContain('PSDs or a whole folder')
    const first = grid.querySelector('[data-ds="AddMockupCard"], [data-ds="MockupCard"]')
    expect(first?.getAttribute('data-ds')).toBe('AddMockupCard')
  })

  it('To sort offers Toss this haul, and its confirm shows the size', async () => {
    setup(listOf([inbox(1, { sizeBytes: 3 * 1024 * 1024 }), inbox(2, { sizeBytes: 1024 * 1024 })]))
    render(<InboxPage stage="to_sort" />)
    await screen.findByText('file-1.psd')
    fireEvent.click(screen.getByRole('button', { name: 'Toss this haul' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Toss this haul?')
    expect(dialog.textContent).toContain('2 mockups')
    expect(dialog.textContent).toContain('4 MB')
    expect(screen.getByRole('button', { name: 'Discard 2 mockups' })).toBeTruthy()
  })
})

describe('done toasts', () => {
  it('"All tucked away · 12 mockups stashed" when nothing was skipped', () => {
    expect(doneMessage(12, 0)).toEqual({ message: 'All tucked away · 12 mockups stashed' })
  })

  it('"10 tucked away · 2 skipped ones are waiting in To stash." when some were skipped', () => {
    expect(doneMessage(10, 2)).toEqual({
      message: '10 tucked away',
      description: '2 skipped ones are waiting in To stash.'
    })
  })
})

describe('Trash', () => {
  const list = [
    trashed(1, { title: 'Old' }),
    trashed(3, { title: 'Newest' }),
    trashed(2, { title: 'Middle' })
  ]
  const handlers = (extra: Record<string, Handler> = {}) => ({
    [IPC_CHANNELS.TRASH_LIST]: () => ok({ items: list }),
    [IPC_CHANNELS.TRASH_STATS]: () => ok({ count: 3, bytes: 6144 }),
    ...extra
  })

  it('has no Add card, shows "Trashed … ago", newest first', async () => {
    setup(handlers())
    render(<TrashPage />)
    await screen.findByText('Newest')
    expect(screen.queryByText('Add a mockup')).toBeNull()
    const titles = [...document.querySelectorAll('[data-mockup-id]')].map((el) =>
      el.getAttribute('data-mockup-id')
    )
    expect(titles).toEqual(['3', '2', '1'])
    expect(card(3).textContent).toContain('Trashed')
  })

  it('Restore all needs no confirm and its toast offers Undo', async () => {
    setup(
      handlers({
        [IPC_CHANNELS.TRASH_RESTORE_ALL]: () => ok({ restoredIds: [1, 2, 3], missing: [] })
      })
    )
    render(<TrashPage />)
    await screen.findByText('Newest')
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }))
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    const onUndo = toasts.undoToast.mock.calls[0]?.[1] as () => void
    onUndo()
    await waitFor(() => expect(sent(IPC_CHANNELS.MOCKUP_TRASH)).toEqual([{ ids: [1, 2, 3] }]))
  })

  it('names the selection: "Restore 2"', async () => {
    setup(
      handlers({ [IPC_CHANNELS.TRASH_RESTORE]: () => ok({ restoredIds: [3, 2], missing: [] }) })
    )
    render(<TrashPage />)
    await screen.findByText('Newest')
    fireEvent.click(card(3))
    fireEvent.click(card(2), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Restore 2' }))
    await waitFor(() => expect(sent(IPC_CHANNELS.TRASH_RESTORE)).toEqual([{ ids: [3, 2] }]))
  })

  it('hover Restore and Delete for good act on that card', async () => {
    setup(
      handlers({
        [IPC_CHANNELS.TRASH_RESTORE]: () => ok({ restoredIds: [3], missing: [] }),
        [IPC_CHANNELS.TRASH_DELETE_ENTRY]: () => ok({ deletedIds: [3], skippedIds: [] })
      })
    )
    render(<TrashPage />)
    await screen.findByText('Newest')
    fireEvent.click(within3('Restore'))
    await waitFor(() => expect(sent(IPC_CHANNELS.TRASH_RESTORE)).toEqual([{ ids: [3] }]))
    fireEvent.click(within3('Delete for good'))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Newest')
    expect(sent(IPC_CHANNELS.TRASH_DELETE_ENTRY)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good', hidden: false }))
  })

  it('right-click offers the same two', async () => {
    setup(handlers())
    render(<TrashPage />)
    await screen.findByText('Newest')
    fireEvent.contextMenu(card(3))
    expect(await screen.findByRole('menuitem', { name: /^Restore/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Delete for good/ })).toBeTruthy()
  })

  it('Empty Trash asks once, naming the count and the space it frees', async () => {
    setup(handlers({ [IPC_CHANNELS.TRASH_EMPTY]: () => ok({ deletedCount: 3, bytesFreed: 6144 }) }))
    render(<TrashPage />)
    await screen.findByText('Newest')
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('3 items')
    expect(dialog.textContent).toContain('6 KB')
    expect(sent(IPC_CHANNELS.TRASH_EMPTY)).toEqual([])
    const confirm = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent === 'Empty Trash'
    )!
    fireEvent.click(confirm)
    await waitFor(() => expect(sent(IPC_CHANNELS.TRASH_EMPTY)).toHaveLength(1))
  })

  it('offers Keep in Trash or Delete entry when a PSD is gone', async () => {
    setup(
      handlers({
        [IPC_CHANNELS.TRASH_RESTORE_ALL]: () => ok({ restoredIds: [1, 2], missing: [3] }),
        [IPC_CHANNELS.TRASH_DELETE_ENTRY]: () => ok({ deletedIds: [3], skippedIds: [] })
      })
    )
    render(<TrashPage />)
    await screen.findByText('Newest')
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(screen.getByRole('button', { name: 'Keep in Trash' })).toBeTruthy()
    fireEvent.click(
      [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete entry')!
    )
    await waitFor(() => expect(sent(IPC_CHANNELS.TRASH_DELETE_ENTRY)).toEqual([{ ids: [3] }]))
  })

  it('disables both action bar buttons and shows loading cards while loading', () => {
    setup({ [IPC_CHANNELS.TRASH_LIST]: () => new Promise(() => {}) })
    render(<TrashPage />)
    expect(
      (screen.getByRole('button', { name: 'Empty Trash' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Restore all' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(document.querySelector('[data-state="loading"]')).toBeTruthy()
  })

  it('says so when Trash is empty', async () => {
    setup({ [IPC_CHANNELS.TRASH_LIST]: () => ok({ items: [] }) })
    render(<TrashPage />)
    expect(await screen.findByText('Not a crumb in here')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to My Stash' })).toBeTruthy()
  })
})

function within3(label: string): HTMLElement {
  return [...card(3).querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
}
