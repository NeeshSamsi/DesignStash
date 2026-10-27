import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SUMMARY_MS } from '@renderer/lib/dock'
import { IPC_CHANNELS } from '@shared/ipc'
import type { CopyProgress, CopyStatus } from '@shared/ipc/import'
import { useCopyStore } from '@renderer/stores/copyStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { installApi, ok } from '../onboarding/test-api'
import { GatherDock, useGather, useGatherDrops } from './index'

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

// The overrides may pick any state, so the merged object is checked against the union by the cast.
const haul = (over: Partial<CopyStatus> = {}): CopyStatus =>
  ({
    haulId: 'h1',
    state: 'running',
    total: 40,
    landed: 12,
    bytesTotal: 0,
    bytesCopied: 0,
    bytesPerSecond: 0,
    secondsLeft: null,
    skipped: { notPsd: 0, duplicate: 0, unreadable: 0, archiveUnsupported: 0, noPsdInArchive: 0 },
    files: [{ jobId: 1, name: 'phone_front.psd', status: 'done' }],
    ...over
  }) as CopyStatus
const progress = (over: Partial<CopyProgress> = {}): CopyProgress => {
  const { files, ...counts } = haul()
  void files
  return { ...counts, file: null, ...over } as CopyProgress
}

function Harness() {
  const gather = useGather()
  const drops = useGatherDrops(gather)
  return (
    <div>
      <button onClick={() => void gather.addFiles()}>add files</button>
      <button onClick={() => void gather.addFolder()}>add folder</button>
      <GatherDock gather={gather} />
      {drops.overlay}
      {drops.hint}
    </div>
  )
}

const base = (extra: Record<string, (r: unknown) => unknown> = {}) => ({
  [IPC_CHANNELS.COPY_STATUS]: () => ok({ haul: null }),
  [IPC_CHANNELS.INBOX_COUNTS]: () => ok({ toSort: 38, toStash: 0, sniffing: 0, trash: 0 }),
  ...extra
})

beforeEach(() => {
  useCopyStore.getState().reset()
  useUiStore.setState({ view: 'all', modal: null, settingsOpen: false })
  toasts.toast.mockClear()
})

const dragEvent = (type: string, items: { kind: string; type: string }[], files: File[] = []) => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: unknown
  }
  event.dataTransfer = {
    types: ['Files'],
    items: items.map((i) => ({ ...i })),
    files,
    dropEffect: 'none'
  }
  return event
}
const fire = (event: Event) => act(() => void window.dispatchEvent(event))

describe('starting a copy', () => {
  it('Add files sends the picked PSDs to the copy queue', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_PSD_FILES]: () => ok({ paths: ['/a/one.psd', '/a/two.psd'] }),
        [IPC_CHANNELS.COPY_START]: () => ok(haul())
      })
    )
    render(<Harness />)
    fireEvent.click(screen.getByText('add files'))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([{ paths: ['/a/one.psd', '/a/two.psd'] }])
    )
    expect(await screen.findByText('12 of 40 copied')).toBeTruthy()
  })

  it('Add folder sends the folder', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Users/ada/Client mockups' }),
        [IPC_CHANNELS.COPY_START]: () => ok(haul())
      })
    )
    render(<Harness />)
    fireEvent.click(screen.getByText('add folder'))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([{ paths: ['/Users/ada/Client mockups'] }])
    )
  })

  it('a cancelled picker starts nothing', async () => {
    const api = installApi(
      base({ [IPC_CHANNELS.DIALOG_SELECT_PSD_FILES]: () => ok({ paths: [] }) })
    )
    render(<Harness />)
    fireEvent.click(screen.getByText('add files'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES)).toHaveLength(1))
    expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([])
  })

  it('a failed start says so and shows no widget', async () => {
    installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_PSD_FILES]: () => ok({ paths: ['/a.psd'] }),
        [IPC_CHANNELS.COPY_START]: () => ({ success: false, error: { code: 'X', message: 'x' } })
      })
    )
    render(<Harness />)
    fireEvent.click(screen.getByText('add files'))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(screen.queryByText(/Copying/)).toBeNull()
  })
})

describe('the widget', () => {
  it('follows the copy:progress push, file by file', async () => {
    const api = installApi(base())
    render(<Harness />)
    api.push(
      IPC_CHANNELS.COPY_PROGRESS,
      progress({ file: { jobId: 1, name: 'phone_front.psd', status: 'copying' } })
    )
    expect(await screen.findByText('12 of 40 copied')).toBeTruthy()
    expect(screen.getByText('phone_front.psd')).toBeTruthy()
    api.push(
      IPC_CHANNELS.COPY_PROGRESS,
      progress({ landed: 13, file: { jobId: 1, name: 'phone_front.psd', status: 'done' } })
    )
    expect(screen.getByText('13 of 40 copied')).toBeTruthy()
    expect(screen.getAllByText('phone_front.psd')).toHaveLength(1)
  })

  it('moves the bar and the time left as bytes are pushed, and shows each file\u2019s own percent', async () => {
    const api = installApi(base())
    render(<Harness />)
    const push = (bytesCopied: number, fileBytes: number, secondsLeft: number | null) =>
      api.push(
        IPC_CHANNELS.COPY_PROGRESS,
        progress({
          bytesTotal: 1000,
          bytesCopied,
          bytesPerSecond: secondsLeft === null ? 0 : 100,
          secondsLeft,
          file: { jobId: 2, name: 'big.psd', status: 'copying', size: 400, bytesCopied: fileBytes }
        })
      )

    push(100, 100, null)
    expect(await screen.findByRole('progressbar', { name: '12 of 40 copied' })).toBeTruthy()
    expect(screen.queryByText(/left/)).toBeNull()
    expect(
      screen.getByRole('progressbar', { name: 'Copying big.psd' }).getAttribute('aria-valuenow')
    ).toBe('25')

    push(600, 300, 125)
    expect(screen.getByText('About 3 min left')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: '12 of 40 copied' }).getAttribute('aria-valuenow')
    ).toBe('60')
    expect(
      screen.getByRole('progressbar', { name: 'Copying big.psd' }).getAttribute('aria-valuenow')
    ).toBe('75')

    push(900, 400, 8)
    expect(screen.getByText('A few seconds left')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: '12 of 40 copied' }).getAttribute('aria-valuenow')
    ).toBe('90')
  })

  it('picks up a haul that was running before a relaunch', async () => {
    installApi(base({ [IPC_CHANNELS.COPY_STATUS]: () => ok({ haul: haul() }) }))
    render(<Harness />)
    expect(await screen.findByText('12 of 40 copied')).toBeTruthy()
  })

  it('does not bring back an old finished haul at launch', async () => {
    const api = installApi(
      base({ [IPC_CHANNELS.COPY_STATUS]: () => ok({ haul: haul({ state: 'done' }) }) })
    )
    render(<Harness />)
    await waitFor(() => expect(api.sent(IPC_CHANNELS.COPY_STATUS)).toHaveLength(1))
    expect(screen.queryByText(/copied/)).toBeNull()
  })

  it('collapses to a summary when done, and dismisses', async () => {
    const api = installApi(base())
    render(<Harness />)
    api.push(
      IPC_CHANNELS.COPY_PROGRESS,
      progress({
        state: 'done',
        landed: 38,
        skipped: {
          notPsd: 2,
          duplicate: 1,
          unreadable: 0,
          archiveUnsupported: 0,
          noPsdInArchive: 0
        }
      })
    )
    expect(await screen.findByText('38 copied · 3 skipped')).toBeTruthy()
    expect(document.querySelector('[data-ds="CopyWidget"]')?.getAttribute('data-view')).toBe(
      'collapsed'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('38 copied · 3 skipped')).toBeNull()
    // A late push for the same haul does not bring it back.
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'done', landed: 38 }))
    expect(screen.queryByText(/copied/)).toBeNull()
  })

  it('Cancel stops the copy, then asks to keep what landed or undo it', async () => {
    const api = installApi(base({ [IPC_CHANNELS.COPY_CANCEL]: () => ok({ landedIds: [1, 2] }) }))
    render(<Harness />)
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress())
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.COPY_CANCEL)).toEqual([{ haulId: 'h1' }]))
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'cancelled' }))
    expect(await screen.findByText('Copying stopped at 12 of 40')).toBeTruthy()
    expect(screen.getByText('Keep the 12 that made it in, or undo all?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep 12' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Undo all' })).toBeTruthy()
  })

  it('Keep leaves what landed and clears the widget', async () => {
    const api = installApi(base())
    render(<Harness />)
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'cancelled' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep 12' }))
    expect(screen.queryByText(/Copying stopped/)).toBeNull()
  })

  it('Undo all undoes the import’s own entry, so it goes to Trash and Redo can bring it back (undo.md)', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.UNDO_ENTRY]: () => ok({ status: 'done', label: 'Import of 12 mockups' })
      })
    )
    render(<Harness />)
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'cancelled', undoEntryId: 21 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo all' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.UNDO_ENTRY)).toEqual([{ id: 21 }]))
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({
        variant: 'success',
        message: 'Copy undone',
        description: '12 mockups moved to Trash. Your originals weren’t touched.'
      })
    )
    expect(screen.queryByText(/Copying stopped/)).toBeNull()
  })

  it('Undo all a newer change has touched says to use ⌘Z, and keeps the widget', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.UNDO_ENTRY]: () =>
          ok({ status: 'blocked', label: 'Import of 12 mockups', blockedBy: 30 })
      })
    )
    render(<Harness />)
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'cancelled', undoEntryId: 21 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo all' }))
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({
        variant: 'error',
        message: 'Changed since. Use ⌘Z'
      })
    )
    expect(screen.getByText(/Copying stopped/)).toBeTruthy()
  })

  it('a paused copy says why and Retry carries on', async () => {
    const api = installApi(base({ [IPC_CHANNELS.COPY_RETRY]: () => ok(haul()) }))
    render(<Harness />)
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'paused', pauseReason: 'disk-full' }))
    expect(await screen.findByText('Copying paused · your disk is full')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.COPY_RETRY)).toEqual([{ haulId: 'h1' }]))
    expect(await screen.findByText('12 of 40 copied')).toBeTruthy()
  })
})

describe('a finished copy', () => {
  const finish = (api: ReturnType<typeof installApi>) =>
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'done', landed: 4 }))

  it('stays about as long as a toast, then collapses away', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = installApi(base())
      render(<Harness />)
      await act(async () => {})
      finish(api)
      expect(await screen.findByText('4 copied')).toBeTruthy()
      act(() => void vi.advanceTimersByTime(SUMMARY_MS - 1500))
      expect(screen.getByText('4 copied')).toBeTruthy()
      act(() => void vi.advanceTimersByTime(1500))
      expect(screen.queryByText('4 copied')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays until dismissed when a file could not be read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = installApi(base())
      render(<Harness />)
      await act(async () => {})
      api.push(
        IPC_CHANNELS.COPY_PROGRESS,
        progress({
          state: 'done',
          landed: 4,
          skipped: {
            notPsd: 0,
            duplicate: 0,
            unreadable: 1,
            archiveUnsupported: 0,
            noPsdInArchive: 0
          }
        })
      )
      expect(await screen.findByText('4 copied · 1 skipped')).toBeTruthy()
      act(() => void vi.advanceTimersByTime(SUMMARY_MS * 3))
      expect(screen.getByText('4 copied · 1 skipped')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps out from over a flow modal, and comes back when it closes', async () => {
    const api = installApi(base())
    render(<Harness />)
    await act(async () => {})
    act(() => useCopyStore.getState().setFlowOpen(true))
    api.push(
      IPC_CHANNELS.COPY_PROGRESS,
      progress({
        state: 'done',
        landed: 4,
        skipped: {
          notPsd: 0,
          duplicate: 0,
          unreadable: 1,
          archiveUnsupported: 0,
          noPsdInArchive: 0
        }
      })
    )
    await act(async () => {})
    expect(screen.queryByText('4 copied · 1 skipped')).toBeNull()
    act(() => useCopyStore.getState().setFlowOpen(false))
    expect(screen.getByText('4 copied · 1 skipped')).toBeTruthy()
  })

  it('hovering holds it, leaving starts the time again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = installApi(base())
      render(<Harness />)
      await act(async () => {})
      finish(api)
      const widget = (await screen.findByText('4 copied')).closest('[data-ds="CopyWidget"]')!
      act(() => void vi.advanceTimersByTime(SUMMARY_MS - 1000))
      fireEvent.mouseEnter(widget)
      act(() => void vi.advanceTimersByTime(SUMMARY_MS * 3))
      expect(screen.getByText('4 copied')).toBeTruthy()
      fireEvent.mouseLeave(widget)
      act(() => void vi.advanceTimersByTime(SUMMARY_MS))
      expect(screen.queryByText('4 copied')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a copy that is still running never times out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = installApi(base())
      render(<Harness />)
      await act(async () => {})
      api.push(IPC_CHANNELS.COPY_PROGRESS, progress())
      expect(await screen.findByText('12 of 40 copied')).toBeTruthy()
      act(() => void vi.advanceTimersByTime(SUMMARY_MS * 5))
      expect(screen.getByText('12 of 40 copied')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a stopped copy waits for Keep or Undo all', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = installApi(base())
      render(<Harness />)
      await act(async () => {})
      api.push(IPC_CHANNELS.COPY_PROGRESS, progress({ state: 'cancelled' }))
      expect(await screen.findByText(/Copying stopped/)).toBeTruthy()
      act(() => void vi.advanceTimersByTime(SUMMARY_MS * 5))
      expect(screen.getByText(/Copying stopped/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('drops', () => {
  const psd = new File([''], 'a.psd')

  it('dragging over My Stash shows the drop overlay; leaving clears it', () => {
    installApi(base())
    render(<Harness />)
    fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
    expect(screen.getByText('Drop PSDs or zips to add them')).toBeTruthy()
    fire(dragEvent('dragleave', []))
    expect(document.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('nested enters and leaves do not flicker the overlay', () => {
    installApi(base())
    render(<Harness />)
    fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
    fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
    fire(dragEvent('dragleave', []))
    expect(document.querySelector('[data-ds="DropOverlay"]')).toBeTruthy()
    fire(dragEvent('dragleave', []))
    expect(document.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('To sort says the drop joins what waits there', async () => {
    useUiStore.setState({ view: 'to-sort' })
    installApi(base())
    render(<Harness />)
    fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
    expect(await screen.findByText('Drop to add them to To sort')).toBeTruthy()
    expect(screen.getByText('They’ll join the 38 mockups already waiting.')).toBeTruthy()
  })

  it('non-PSDs are rejected while dragging', () => {
    installApi(base())
    render(<Harness />)
    fire(dragEvent('dragenter', [{ kind: 'file', type: 'image/png' }]))
    expect(screen.getByText('Those aren’t PSDs or zips')).toBeTruthy()
    expect(document.querySelector('[data-ds="DropOverlay"]')?.getAttribute('data-state')).toBe(
      'rejected'
    )
  })

  it('a drag during a copy is queued, naming how many join', () => {
    const api = installApi(base())
    render(<Harness />)
    api.push(IPC_CHANNELS.COPY_PROGRESS, progress())
    fire(
      dragEvent('dragenter', [
        { kind: 'file', type: '' },
        { kind: 'file', type: '' }
      ])
    )
    expect(screen.getByText('Add 2 more to the copy')).toBeTruthy()
  })

  it('dropping PSDs starts a copy with their paths', async () => {
    const api = installApi(base({ [IPC_CHANNELS.COPY_START]: () => ok(haul()) }))
    window.api.getPathForFile = vi.fn((f: File) => `/drop/${f.name}`)
    render(<Harness />)
    fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
    fire(dragEvent('drop', [{ kind: 'file', type: '' }], [psd, new File([''], 'x.png')]))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([{ paths: ['/drop/a.psd'] }])
    )
    expect(document.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('dropping a folder with a dot in its name starts a copy with it', async () => {
    const api = installApi(base({ [IPC_CHANNELS.COPY_START]: () => ok(haul()) }))
    window.api.getPathForFile = vi.fn((f: File) => `/drop/${f.name}`)
    render(<Harness />)
    const folder = new File([''], 'Device Mockups 2.0')
    const drop = dragEvent('drop', [], [folder])
    ;(drop.dataTransfer as { items: unknown[] }).items = [
      { kind: 'file', type: '', webkitGetAsEntry: () => ({ isDirectory: true }) }
    ]
    fire(drop)
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([{ paths: ['/drop/Device Mockups 2.0'] }])
    )
    expect(toasts.toast).not.toHaveBeenCalled()
  })

  it('dropping only non-PSDs adds nothing and says why', async () => {
    const api = installApi(base())
    window.api.getPathForFile = vi.fn((f: File) => `/drop/${f.name}`)
    render(<Harness />)
    fire(dragEvent('drop', [{ kind: 'file', type: 'image/png' }], [new File([''], 'x.png')]))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([])
  })

  it.each(['to-stash', 'trash'] as const)(
    'on %s a hint follows the cursor and a drop adds nothing',
    (view) => {
      useUiStore.setState({ view })
      const api = installApi(base())
      window.api.getPathForFile = vi.fn((f: File) => `/drop/${f.name}`)
      render(<Harness />)
      fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
      expect(screen.getByText('Drop files on My Stash to add them')).toBeTruthy()
      expect(document.querySelector('[data-ds="DropOverlay"]')).toBeNull()
      const drop = dragEvent('drop', [{ kind: 'file', type: '' }], [psd])
      fire(drop)
      expect(api.sent(IPC_CHANNELS.COPY_START)).toEqual([])
      expect(drop.defaultPrevented).toBe(true)
    }
  )

  it('under Settings it shows the hint, not the overlay', () => {
    useUiStore.setState({ view: 'all', settingsOpen: true })
    installApi(base())
    render(<Harness />)
    fire(dragEvent('dragenter', [{ kind: 'file', type: '' }]))
    expect(screen.getByText('Drop files on My Stash to add them')).toBeTruthy()
    expect(document.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('ignores drags that are not files', () => {
    installApi(base())
    render(<Harness />)
    const event = new Event('dragenter', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: unknown
    }
    event.dataTransfer = { types: ['text/plain'], items: [], files: [] }
    fire(event)
    expect(document.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })
})
