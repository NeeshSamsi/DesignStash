import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxCounts, InboxItem } from '@shared/inbox'
import type { CopyStatus } from '@shared/ipc/import'
import { useCopyStore } from '@renderer/stores/copyStore'
import { useInboxStore } from '@renderer/stores/inboxStore'
import { useWaitingStripStore } from '@renderer/stores/waitingStripStore'
import { item } from './library-test-utils'
import { WaitingToSortStrip } from './WaitingToSortStrip'

const waitingItem = (id: number, over: Partial<InboxItem> = {}): InboxItem => ({
  ...item(id),
  title: `file-${id}.psd`,
  reviewStatus: 'needs_review',
  stage: 'to_sort',
  aiStatus: 'ready',
  sizeBytes: 1024,
  batchId: 'batch-1',
  coverPath: `/covers/${id}.jpg`,
  ...over
})

const counts = (toSort: number): InboxCounts => ({ toSort, toStash: 0, sniffing: 0, trash: 0 })

let pushes: Map<string, Set<(payload: unknown) => void>>
let list: InboxItem[]
let current: InboxCounts

function setup(items: InboxItem[], total = items.length) {
  list = items
  current = counts(total)
  pushes = new Map()
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.INBOX_COUNTS) return { success: true, data: current }
      if (channel === IPC_CHANNELS.INBOX_LIST) return { success: true, data: { items: list } }
      return { success: true, data: {} }
    }),
    subscribe: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      const set = pushes.get(channel) ?? new Set()
      set.add(cb)
      pushes.set(channel, set)
      return () => set.delete(cb)
    })
  } as unknown as typeof window.api
}

/** Main lands more files: the list and the counts both move, and it pushes the counts. */
function land(items: InboxItem[], total = items.length) {
  list = items
  current = counts(total)
  act(() => pushes.get(IPC_CHANNELS.INBOX_COUNTS_CHANGED)?.forEach((cb) => cb(current)))
}

const haul = (over: Partial<CopyStatus> = {}): CopyStatus => ({
  haulId: 'h1',
  state: 'running',
  pauseReason: null,
  total: 38,
  landed: 12,
  bytesTotal: 100,
  bytesCopied: 30,
  bytesPerSecond: 10,
  secondsLeft: 7,
  skipped: { notPsd: 0, duplicate: 0, unreadable: 0 },
  files: [],
  ...over
})

// The strip folds away rather than leaving the tree: it counts as there only while open.
const strip = () => document.querySelector('[data-open="true"] [data-ds="WaitingToSortStrip"]')
const covers = () => strip()?.querySelectorAll('[data-ds="CoverImage"]') ?? []

beforeEach(() => {
  useCopyStore.getState().reset()
  useInboxStore.getState().reset()
  useWaitingStripStore.setState({ hiddenAt: null })
})

describe('WaitingToSortStrip', () => {
  it('stays out of the way while To sort is empty', async () => {
    setup([])
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    await waitFor(() => expect(window.api.invoke).toHaveBeenCalled())
    expect(strip()).toBeNull()
  })

  it('says how many wait and what to do, with up to three covers', async () => {
    setup(
      [1, 2, 3, 4].map((id) => waitingItem(id)),
      38
    )
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    expect(await screen.findByText('38 mockups waiting to be sorted')).toBeTruthy()
    expect(
      screen.getByText(
        'They landed in To sort. Sort them into piles, then look them over to stash them.'
      )
    ).toBeTruthy()
    expect(covers()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sort now' })).toBeTruthy()
  })

  it('uses the singular for one', async () => {
    setup([waitingItem(1)])
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    expect(await screen.findByText('1 mockup waiting to be sorted')).toBeTruthy()
    expect(covers()).toHaveLength(1)
  })

  it('follows a running copy as files land, without waiting for it to finish', async () => {
    setup([waitingItem(1)], 1)
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    await screen.findByText('1 mockup waiting to be sorted')

    act(() => useCopyStore.getState().setHaul(haul({ landed: 1 })))
    expect(screen.getByText('1 mockup waiting to be sorted')).toBeTruthy()

    land(
      [1, 2, 3, 4].map((id) => waitingItem(id)),
      12
    )
    act(() => useCopyStore.getState().setHaul(haul({ landed: 12 })))
    expect(await screen.findByText('12 mockups waiting to be sorted')).toBeTruthy()
    expect(covers()).toHaveLength(3)

    act(() => useCopyStore.getState().setHaul(haul({ state: 'done', landed: 38 })))
    land(
      [1, 2, 3].map((id) => waitingItem(id)),
      38
    )
    expect(await screen.findByText('38 mockups waiting to be sorted')).toBeTruthy()
  })

  it('fills a cover in as the mockup arrives', async () => {
    setup([], 2)
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    await screen.findByText('2 mockups waiting to be sorted')
    expect([...covers()].map((c) => c.getAttribute('data-state'))).toEqual(['loading', 'loading'])
    land([waitingItem(1), waitingItem(2)], 2)
    await waitFor(() =>
      expect([...covers()].map((c) => c.getAttribute('data-state'))).toEqual(['loaded', 'loaded'])
    )
  })

  it('Sort now hands what is waiting to Sort', async () => {
    const onSort = vi.fn()
    setup([waitingItem(1), waitingItem(2)])
    render(<WaitingToSortStrip onSort={onSort} />)
    await screen.findByText('2 mockups waiting to be sorted')
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Sort now' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sort now' }))
    expect(onSort).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 })
    ])
  })

  it('folds away inert and out of the accessibility tree, so it never takes space or focus', async () => {
    setup([waitingItem(1)])
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    await screen.findByText('1 mockup waiting to be sorted')
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    const fold = document.querySelector('[data-open="false"]') as HTMLElement
    expect(fold.getAttribute('aria-hidden')).toBe('true')
    expect(fold.hasAttribute('inert')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Sort now' })).toBeNull()
  })

  it('Later hides it until the next copy lands', async () => {
    setup([waitingItem(1), waitingItem(2)])
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    await screen.findByText('2 mockups waiting to be sorted')
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(strip()).toBeNull()

    // The same haul still waiting: still put off.
    land([waitingItem(1), waitingItem(2)])
    expect(strip()).toBeNull()

    // A copy lands more: it is back.
    land([1, 2, 3].map((id) => waitingItem(id)))
    expect(await screen.findByText('3 mockups waiting to be sorted')).toBeTruthy()
  })

  it('comes back for a later copy after the haul was sorted down', async () => {
    setup([1, 2, 3].map((id) => waitingItem(id)))
    render(<WaitingToSortStrip onSort={vi.fn()} />)
    await screen.findByText('3 mockups waiting to be sorted')
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    land([waitingItem(1)])
    expect(strip()).toBeNull()
    land([waitingItem(1), waitingItem(2)])
    expect(await screen.findByText('2 mockups waiting to be sorted')).toBeTruthy()
  })
})
