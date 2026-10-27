import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DriftReport } from '@shared/integrity'
import { installApi, ok, type TestApi } from '../onboarding/test-api'
import { StashCheckModal } from './StashCheckModal'

// Behaviour in design/specs/settings.md, "Stash check: resolving changes".

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const report: DriftReport = {
  found: [
    { id: 'f1', name: 'poster_new', sizeBytes: 48_000_000 },
    { id: 'f2', name: 'mug_v2', sizeBytes: 31_000_000 }
  ],
  gone: [{ id: 'm9', name: 'Glass iPhone 14' }]
}
const fail = () => ({ success: false, error: { code: 'X', message: 'x' } })

let api: TestApi
const onClose = vi.fn()
const onOpenSettings = vi.fn()

function open(
  handlers: Record<string, (r: unknown) => unknown> = {},
  initial: DriftReport | null = report
) {
  api = installApi({
    [IPC_CHANNELS.INTEGRITY_REPORT]: () => ok(report),
    ...handlers
  })
  return render(
    <StashCheckModal
      report={initial ?? undefined}
      onClose={onClose}
      onOpenSettings={onOpenSettings}
    />
  )
}
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]')

beforeEach(() => {
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
  onClose.mockClear()
  onOpenSettings.mockClear()
})

describe('stash check modal', () => {
  it('opens straight on what the launch check found, without asking again', () => {
    open()
    expect(screen.getByText('poster_new')).toBeTruthy()
    expect(screen.getByText('Glass iPhone 14')).toBeTruthy()
    expect(screen.getByText(/Not in your stash yet · 45.8 MB/)).toBeTruthy()
    expect(api.sent(IPC_CHANNELS.INTEGRITY_REPORT)).toHaveLength(0)
  })

  it('checks first when opened without findings, with skeleton rows and no spinner', async () => {
    let release!: (value: unknown) => void
    open({ [IPC_CHANNELS.INTEGRITY_REPORT]: () => new Promise((r) => (release = r)) }, null)
    expect(screen.getByText('Checking your stash…')).toBeTruthy()
    expect(skeletons().length).toBeGreaterThan(0)
    expect(screen.queryByRole('progressbar')).toBeNull()
    release(ok(report))
    expect(await screen.findByText('poster_new')).toBeTruthy()
    expect(skeletons()).toHaveLength(0)
  })

  it('is blocking: Esc does nothing, there is no close button, and Done waits for 0 left', () => {
    open()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    expect(screen.getByText('3 left')).toBeTruthy()
    expect(button('Done').disabled).toBe(true)
  })

  it('shows plain names, never a path or a code', () => {
    open()
    expect(document.body.textContent).not.toMatch(/\/Users|\/Volumes|\.psd|ENOENT/)
  })

  it('Add puts the file in To sort, takes the row out and offers Undo', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_ADD]: () => ok({ mockupIds: [41] }) })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await waitFor(() => expect(screen.queryByText('poster_new')).toBeNull())
    expect(api.sent(IPC_CHANNELS.INTEGRITY_ADD)).toEqual([{ ids: ['f1'] }])
    expect(screen.getByText('2 left')).toBeTruthy()
    expect(toasts.undoToast).toHaveBeenCalledWith(
      'Added 1 file to To sort',
      expect.any(Function),
      undefined,
      undefined
    )
  })

  it('Undo on an add undoes it in main, then checks again with skeleton rows', async () => {
    open({
      [IPC_CHANNELS.INTEGRITY_ADD]: () => ok({ mockupIds: [41] }),
      [IPC_CHANNELS.INTEGRITY_REPORT]: () => new Promise(() => {})
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.INTEGRITY_UNDO_ADD)).toEqual([{ mockupIds: [41] }])
    )
    await waitFor(() => expect(skeletons().length).toBeGreaterThan(0))
  })

  it('Add all adds every found file and leaves the missing mockup', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_ADD_ALL]: () => ok({ mockupIds: [41, 42] }) })
    fireEvent.click(button('Add all'))
    await waitFor(() => expect(screen.queryByText('mug_v2')).toBeNull())
    expect(screen.getByText('Glass iPhone 14')).toBeTruthy()
    expect(toasts.undoToast).toHaveBeenCalledWith(
      'Added 2 files to To sort',
      expect.any(Function),
      undefined,
      undefined
    )
  })

  it('Ignore all is instant with Undo, and Done is on at 0 left', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_IGNORE_ALL]: () => ok({ ignoredIds: ['f1', 'f2', 'm9'] }) })
    fireEvent.click(button('Ignore all'))
    expect(await screen.findByText('All sorted')).toBeTruthy()
    expect(button('Done').disabled).toBe(false)
    expect(toasts.undoToast).toHaveBeenCalledWith(
      'Ignored 3 changes',
      expect.any(Function),
      undefined,
      undefined
    )

    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.INTEGRITY_UNIGNORE)).toEqual([{ ids: ['f1', 'f2', 'm9'] }])
    )
  })

  it('Done closes once everything is resolved', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_IGNORE_ALL]: () => ok({ ignoredIds: ['f1', 'f2', 'm9'] }) })
    fireEvent.click(button('Ignore all'))
    await screen.findByText('All sorted')
    fireEvent.click(button('Done'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Remove drops the record of a missing PSD and says so', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_REMOVE]: () => ok({ removed: 1 }) })
    fireEvent.click(button('Remove'))
    await waitFor(() => expect(screen.queryByText('Glass iPhone 14')).toBeNull())
    expect(api.sent(IPC_CHANNELS.INTEGRITY_REMOVE)).toEqual([{ ids: ['m9'] }])
    expect(toasts.toast).toHaveBeenCalledWith({ variant: 'success', message: 'Removed 1 mockup' })
  })

  it('Remove all removes every missing mockup', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_REMOVE_ALL]: () => ok({ removed: 1 }) })
    fireEvent.click(button('Remove all'))
    await waitFor(() => expect(screen.queryByText('Glass iPhone 14')).toBeNull())
    expect(api.sent(IPC_CHANNELS.INTEGRITY_REMOVE_ALL)).toHaveLength(1)
  })

  it('Relink lets main open the dialog (no path crosses), then checks again', async () => {
    open({
      [IPC_CHANNELS.INTEGRITY_RELINK]: () => ok({ outcome: 'relinked' }),
      [IPC_CHANNELS.INTEGRITY_REPORT]: () => ok({ found: report.found, gone: [] })
    })
    fireEvent.click(button('Relink…'))
    expect(await screen.findByText('2 left')).toBeTruthy()
    expect(api.sent(IPC_CHANNELS.INTEGRITY_RELINK)).toEqual([{ id: 'm9' }])
    expect(skeletons()).toHaveLength(0)
  })

  it.each([
    ['not-psd', 'That isn’t a PSD. Pick a PSD file.'],
    ['already-in-stash', 'That PSD is already in your stash.'],
    ['failed', 'Couldn’t relink that. Try again.']
  ])('Relink %s says why in plain words and keeps the row', async (outcome, message) => {
    open({ [IPC_CHANNELS.INTEGRITY_RELINK]: () => ok({ outcome }) })
    fireEvent.click(button('Relink…'))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalledWith({ variant: 'error', message }))
    expect(screen.getByText('Glass iPhone 14')).toBeTruthy()
  })

  it('a cancelled Relink dialog changes nothing and says nothing', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_RELINK]: () => ok({ outcome: 'cancelled' }) })
    fireEvent.click(button('Relink…'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.INTEGRITY_RELINK)).toHaveLength(1))
    expect(toasts.toast).not.toHaveBeenCalled()
    expect(screen.getByText('3 left')).toBeTruthy()
  })

  it('a failed action keeps the rows and says so', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_ADD]: fail })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({
        variant: 'error',
        message: 'Couldn’t add those. Try again.'
      })
    )
    expect(screen.getByText('poster_new')).toBeTruthy()
    expect(button('Done').disabled).toBe(true)
  })

  it('a failed check closes the modal and points at Settings › My Stash', async () => {
    open({ [IPC_CHANNELS.INTEGRITY_REPORT]: fail }, null)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const call = toasts.toast.mock.calls[0]![0]
    expect(call).toMatchObject({
      variant: 'error',
      message: 'Couldn’t check your stash folder',
      description: 'Open Settings › My Stash to try again.'
    })
    call.action.onClick()
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('an Undo clicked during an action waits for it and never blanks the rows', async () => {
    let finishRemove!: (value: unknown) => void
    open({
      [IPC_CHANNELS.INTEGRITY_ADD]: () => ok({ mockupIds: [41] }),
      [IPC_CHANNELS.INTEGRITY_REMOVE]: () => new Promise((r) => (finishRemove = r)),
      [IPC_CHANNELS.INTEGRITY_UNDO_ADD]: () => ok({}),
      [IPC_CHANNELS.INTEGRITY_REPORT]: () => ok(report)
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    fireEvent.click(button('Remove'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.INTEGRITY_REMOVE)).toHaveLength(1))

    toasts.undoToast.mock.calls[0]![1]()
    await new Promise((r) => setTimeout(r, 20))
    // The Undo is queued behind the action: nothing sent yet, and no skeleton rows.
    expect(api.sent(IPC_CHANNELS.INTEGRITY_UNDO_ADD)).toHaveLength(0)
    expect(skeletons()).toHaveLength(0)

    finishRemove(ok({ removed: 1 }))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.INTEGRITY_UNDO_ADD)).toEqual([{ mockupIds: [41] }])
    )
    expect(await screen.findByText('poster_new')).toBeTruthy()
  })

  it('two quick Undos apply the latest check, not the older one', async () => {
    const first = { found: [{ id: 'old', name: 'older_scan', sizeBytes: null }], gone: [] }
    const second = { found: [{ id: 'new', name: 'newer_scan', sizeBytes: null }], gone: [] }
    const releases: Array<(value: unknown) => void> = []
    open({
      [IPC_CHANNELS.INTEGRITY_IGNORE]: () => ok({ ignoredIds: ['f1'] }),
      [IPC_CHANNELS.INTEGRITY_UNIGNORE]: () => ok({}),
      [IPC_CHANNELS.INTEGRITY_REPORT]: () => new Promise((r) => releases.push(r))
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Ignore' })[0]!)
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    const undo = toasts.undoToast.mock.calls[0]![1]
    undo()
    undo()
    await waitFor(() => expect(releases).toHaveLength(1))
    // The second check starts after the first lands, and its result is the one that shows.
    releases[0]!(ok(first))
    await waitFor(() => expect(releases).toHaveLength(2))
    releases[1]!(ok(second))
    expect(await screen.findByText('newer_scan')).toBeTruthy()
    expect(screen.queryByText('older_scan')).toBeNull()
  })
})
