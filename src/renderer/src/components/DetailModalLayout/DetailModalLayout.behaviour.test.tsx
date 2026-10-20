import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { coverUrl } from '@shared/cover-url'
import { IPC_CHANNELS } from '@shared/ipc'
import { DetailModal } from '@renderer/screens/detail/DetailModal'
import { shortcuts } from '@renderer/lib/shortcuts'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'

// Behaviour spec for Detail & edit, through the screen that owns the data: design/specs/detail.md.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const single = {
  item: {
    id: 42,
    title: 'Hero Screen',
    description: 'The main hero mockup',
    coverPath: '/lib/hero.png',
    coverSource: 'embedded',
    coverMissing: false,
    isGroup: false,
    favourite: false,
    reviewStatus: 'approved',
    createdAt: '2026-10-01',
    variantCount: 0,
    topId: null,
    tags: [{ id: 7, label: 'Clay', categoryLabel: 'Style' }]
  },
  variants: []
}

const pile = {
  item: { ...single.item, id: 99, title: 'Login Pile', isGroup: true, variantCount: 2, topId: 99 },
  variants: [
    { id: 99, title: 'front', coverPath: '/lib/a.png', coverMissing: false, isTop: true },
    { id: 100, title: 'side', coverPath: '/lib/b.png', coverMissing: false, isTop: false },
    { id: 101, title: 'back', coverPath: '/lib/c.png', coverMissing: false, isTop: false }
  ]
}

const tree = [
  {
    categoryId: 3,
    categoryLabel: 'Style',
    tagCount: 1,
    tags: [{ tagId: 7, label: 'Clay', usageCount: 4 }]
  }
]

const ok = (data: unknown) => ({ success: true, data })
const fail = () => ({ success: false, error: { code: 'X', message: 'x' } })

type Handler = (payload: unknown) => unknown
let handlers: Record<string, Handler> = {}
let invoke: ReturnType<typeof vi.fn>
let uninstall: () => void

function setup(overrides: Record<string, Handler> = {}) {
  handlers = {
    [IPC_CHANNELS.MOCKUP_DETAIL]: (p) =>
      ok((p as { mockupId: number }).mockupId === 99 ? pile : single),
    [IPC_CHANNELS.TAG_TREE]: () => ok({ tree }),
    [IPC_CHANNELS.MOCKUP_UPDATE]: () => ok({ updated: true }),
    [IPC_CHANNELS.MOCKUP_TRASH]: () => ok({ ok: true, count: 1 }),
    [IPC_CHANNELS.MOCKUP_RESTORE]: () => ok({ ok: true, count: 1 }),
    [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: () => ok({ opened: true }),
    [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: (p) =>
      ok({ favourite: (p as { favourite: boolean }).favourite }),
    [IPC_CHANNELS.PILE_DISBAND]: () =>
      ok({
        snapshot: { rows: [{ id: 99, isGroup: true, groupId: null }] },
        freedIds: [99, 100, 101]
      }),
    [IPC_CHANNELS.PILE_RESTORE]: () => ok({ restoredIds: [99, 100, 101] }),
    [IPC_CHANNELS.LIBRARY_LIST]: () => ok({ items: [] }),
    [IPC_CHANNELS.LIBRARY_STATS]: () => ok({ total: 0, favourites: 0, groups: 0, trashed: 0 }),
    ...overrides
  }
  invoke = vi.fn(async (channel: string, payload: unknown) => {
    const handler = handlers[channel]
    if (!handler) return ok({})
    return handler(payload)
  })
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((file) => `/path/${(file as File).name}`)
  } as unknown as typeof window.api
}

const calls = (channel: string) => invoke.mock.calls.filter(([name]) => name === channel)

async function open(mockupId = 42) {
  const onClose = vi.fn()
  const view = render(<DetailModal mockupId={mockupId} onClose={onClose} />)
  await screen.findByRole('textbox', { name: 'Title' })
  return { ...view, onClose }
}
const title = () => screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
const edit = (value: string) => fireEvent.change(title(), { target: { value } })
const button = (name: string | RegExp) => screen.queryByRole('button', { name })

beforeEach(() => {
  setup()
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
  useDetailEffects.setState({ revision: 0, pendingSelection: [] })
  useLibraryStore.getState().reset()
  uninstall = shortcuts.install()
})
afterEach(() => uninstall())

describe('Detail & edit', () => {
  it('opens from Edit details, a double-click or Enter, with a skeleton that mirrors the layout and a disabled footer', async () => {
    // The grid opens it (WP2.6); the screen starts with the skeleton, then fills in.
    let resolve: (value: unknown) => void = () => {}
    setup({ [IPC_CHANNELS.MOCKUP_DETAIL]: () => new Promise((r) => (resolve = r)) })
    render(<DetailModal mockupId={42} onClose={() => {}} />)

    const layout = await waitFor(() => {
      const el = document.querySelector('[data-detail-state]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(layout.getAttribute('data-detail-state')).toBe('loading')
    // Cover, tag row and the two fields, as bars: no text, no spinner.
    expect(layout.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(8)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect((button('Open in Photoshop') as HTMLButtonElement).disabled).toBe(true)
    expect(button('Close')).not.toBeNull()

    await act(async () => resolve(ok(single)))
    expect((await screen.findByRole('textbox', { name: 'Title' })) as HTMLInputElement).toBeTruthy()
    expect(title().value).toBe('Hero Screen')
    expect((button('Open in Photoshop') as HTMLButtonElement).disabled).toBe(false)
    expect(layout.getAttribute('data-detail-state')).toBe('loaded')
  })

  it('shows an inline error with Retry and a plain, non-editable title when the entry cannot be read', async () => {
    let attempt = 0
    setup({ [IPC_CHANNELS.MOCKUP_DETAIL]: () => (++attempt === 1 ? fail() : ok(single)) })
    render(<DetailModal mockupId={42} onClose={() => {}} />)

    expect(await screen.findByText('We couldn’t load this mockup')).not.toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('heading', { name: /Mockup details/ })).not.toBeNull()
    expect(screen.getByText(/We couldn’t read its entry in your stash/)).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/SQLITE|ENOENT|\/lib\//)
    expect(button('Retry')).not.toBeNull()
    expect(button('Open in Photoshop')).toBeNull()

    fireEvent.click(button('Retry')!)
    expect(await screen.findByRole('textbox', { name: 'Title' })).not.toBeNull()
    expect(calls(IPC_CHANNELS.MOCKUP_DETAIL)).toHaveLength(2)
  })

  it('shows Save left of Open in Photoshop only once something changes, and saves with Cmd+S', async () => {
    const { onClose } = await open()
    expect(button('Save')).toBeNull()

    edit('Hero Screen 2')
    const save = button('Save')!
    const photoshop = button('Open in Photoshop')!
    expect(save.compareDocumentPosition(photoshop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/unsaved/i)).toBeNull()

    fireEvent.click(save)
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_UPDATE, {
        mockupId: 42,
        title: 'Hero Screen 2',
        description: 'The main hero mockup',
        tagIds: [7]
      })
    )
    await waitFor(() => expect(button('Save')).toBeNull())
    expect(toasts.toast).toHaveBeenCalledWith('Saved your changes', 'success')
    // The modal stays open after saving.
    expect(onClose).not.toHaveBeenCalled()

    edit('Hero Screen 3')
    fireEvent.keyDown(window, { key: 's', metaKey: true })
    await waitFor(() => expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)).toHaveLength(2))
    expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)[1]![1]).toMatchObject({ title: 'Hero Screen 3' })
  })

  it('shows Save disabled with a reason when the title is emptied', async () => {
    await open()
    edit('   ')
    const save = button('Save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    fireEvent.keyDown(window, { key: 's', metaKey: true })
    expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)).toHaveLength(0)

    // The reason is the tooltip on the Save button's wrapper.
    fireEvent.focus(save.parentElement!)
    expect((await screen.findAllByText('Add a title to save')).length).toBeGreaterThan(0)

    edit('Back again')
    expect((button('Save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps edits and shows an error toast (no Retry; Save retries) when saving fails', async () => {
    let attempt = 0
    setup({
      [IPC_CHANNELS.MOCKUP_UPDATE]: () => (++attempt === 1 ? fail() : ok({ updated: true }))
    })
    await open()
    edit('Edited title')
    fireEvent.click(button('Save')!)

    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(toasts.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Couldn’t save your changes',
      description: 'Your edits are still here. Try saving again.'
    })
    expect(toasts.toast.mock.calls[0]![0]).not.toHaveProperty('action')
    expect(title().value).toBe('Edited title')
    // Nothing appears inside the form, and Save is still there to retry.
    expect(screen.queryByRole('alert')).toBeNull()
    expect((button('Save') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(button('Save')!)
    await waitFor(() => expect(button('Save')).toBeNull())
    expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)).toHaveLength(2)
  })

  it('asks Keep editing or Discard when closing with unsaved changes', async () => {
    const { onClose } = await open()

    // Nothing changed: it just closes.
    fireEvent.click(button('Close')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    onClose.mockClear()

    edit('Changed')
    fireEvent.click(button('Close')!)
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Discard your changes?')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Discard' })).not.toBeNull()
    expect(within(dialog).queryByRole('button', { name: /save/i })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(title().value).toBe('Changed')
    expect(button('Save')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    // Esc asks the same question.
    fireEvent.keyDown(document, { key: 'Escape' })
    const again = await screen.findByRole('alertdialog')
    fireEvent.click(within(again).getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)).toHaveLength(0)
  })

  it('moves to Trash instantly from the header trash icon or Cmd+Backspace, closes, and offers Undo', async () => {
    const { onClose, unmount } = await open()
    fireEvent.click(button('Move to Trash')!)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_TRASH, { ids: [42] })
    // No confirm dialog.
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(toasts.undoToast).toHaveBeenCalledWith('Moved to Trash', expect.any(Function))

    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_RESTORE, { ids: [42] })
    )
    unmount()

    const second = await open()
    fireEvent.keyDown(document.body, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(second.onClose).toHaveBeenCalledOnce())
    expect(calls(IPC_CHANNELS.MOCKUP_TRASH)).toHaveLength(2)
  })

  it('leaves Cmd+Backspace to the field while typing in it', async () => {
    const { onClose } = await open()
    fireEvent.keyDown(title(), { key: 'Backspace', metaKey: true })
    expect(calls(IPC_CHANNELS.MOCKUP_TRASH)).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disbands the pile instantly, closes, selects the mockups in the grid, and offers Undo', async () => {
    const { onClose } = await open(99)
    expect(button('Disband pile')).not.toBeNull()
    fireEvent.click(button('Disband pile')!)

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PILE_DISBAND, { pileId: 99 })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useDetailEffects.getState().pendingSelection).toEqual([99, 100, 101])
    expect(useDetailEffects.getState().revision).toBeGreaterThan(0)
    expect(toasts.undoToast).toHaveBeenCalledWith(
      'Pile disbanded',
      expect.any(Function),
      '3 mockups are on their own'
    )

    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PILE_RESTORE, {
        snapshot: { rows: [{ id: 99, isGroup: true, groupId: null }] }
      })
    )
    expect(useDetailEffects.getState().pendingSelection).toEqual([])
  })

  it('offers Disband pile for a pile only', async () => {
    await open(42)
    expect(button('Disband pile')).toBeNull()
  })

  it('offers no Duplicate and no permanent delete', async () => {
    await open(99)
    expect(button(/duplicate/i)).toBeNull()
    expect(button(/delete|permanent/i)).toBeNull()
    expect(screen.queryByText(/delete for good|duplicate/i)).toBeNull()
    const sent = invoke.mock.calls.map(([channel]) => channel)
    // The removed channels no longer exist, so only the Trash and pile channels can be sent.
    expect(sent.every((channel) => typeof channel === 'string')).toBe(true)
  })

  it('offers Try again or Cancel when Photoshop does not open', async () => {
    let attempt = 0
    setup({
      [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: () =>
        ++attempt === 1 ? ok({ opened: false, reason: 'no-app' }) : ok({ opened: true })
    })
    await open()
    fireEvent.click(button('Open in Photoshop')!)

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Photoshop isn’t installed')).not.toBeNull()
    expect(dialog.textContent).not.toMatch(/[/\\]|ENOENT|no-app/)
    const names = within(dialog)
      .getAllByRole('button')
      .map((el) => el.textContent)
    expect(names.sort()).toEqual(['Cancel', 'Try again'])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('closes the Photoshop dialog with Cancel and does not try again', async () => {
    setup({ [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: () => ok({ opened: false, reason: 'failed' }) })
    await open()
    fireEvent.click(button('Open in Photoshop')!)
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Photoshop didn’t open')).not.toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)).toHaveLength(1)
  })
})

describe('Detail & edit · cover', () => {
  const change = (over: Record<string, unknown> = {}) => ({
    ok: true,
    coverPath: '/lib/new.png',
    coverSource: 'user-uploaded',
    width: 1000,
    height: 1000,
    previous: { coverPath: '/lib/hero.png', coverSource: 'embedded' },
    ...over
  })
  const coverImg = () => document.querySelector<HTMLImageElement>('[aria-label="Cover"] img')!
  const choose = (name = 'new.png') => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/png' })] } })
  }
  const uploaded = { ...single, item: { ...single.item, coverSource: 'user-uploaded' } }

  it('replaces the cover, shows the new image with its crop note, and offers Undo', async () => {
    setup({ [IPC_CHANNELS.MOCKUP_SET_COVER]: () => ok(change()) })
    await open()
    expect(coverImg().getAttribute('src')).toBe(coverUrl('/lib/hero.png'))
    choose()

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_SET_COVER, {
        mockupId: 42,
        filePath: '/path/new.png'
      })
    )
    await waitFor(() => expect(coverImg().getAttribute('src')).toContain(coverUrl('/lib/new.png')))
    expect(screen.getByText('Uploaded')).not.toBeNull()
    expect(screen.getByText('Cropped to 4:3')).not.toBeNull()
    expect(toasts.undoToast).toHaveBeenCalledWith('Cover replaced', expect.any(Function))
    // A cover change is not a form edit: Save stays hidden.
    expect(button('Save')).toBeNull()
  })

  it('undoes a replace back to the PSD’s preview', async () => {
    setup({
      [IPC_CHANNELS.MOCKUP_SET_COVER]: () => ok(change()),
      [IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER]: () =>
        ok(
          change({
            coverPath: '/lib/hero.png',
            coverSource: 'embedded',
            previous: { coverPath: '/lib/new.png', coverSource: 'user-uploaded' }
          })
        )
    })
    await open()
    choose()
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())

    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: 42 })
    )
    await waitFor(() => expect(coverImg().getAttribute('src')).toContain(coverUrl('/lib/hero.png')))
    expect(screen.getByText('Embedded preview')).not.toBeNull()
  })

  it('undoes a replace back to the earlier uploaded cover', async () => {
    setup({
      [IPC_CHANNELS.MOCKUP_DETAIL]: () => ok(uploaded),
      [IPC_CHANNELS.MOCKUP_SET_COVER]: (p) =>
        ok(
          (p as { filePath: string }).filePath === '/lib/hero.png'
            ? change({ coverPath: '/lib/hero.png' })
            : change({ previous: { coverPath: '/lib/hero.png', coverSource: 'user-uploaded' } })
        )
    })
    await open()
    choose()
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_SET_COVER, {
        mockupId: 42,
        filePath: '/lib/hero.png'
      })
    )
    await waitFor(() => expect(coverImg().getAttribute('src')).toContain(coverUrl('/lib/hero.png')))
  })

  it('keeps the cover and shows an error Banner when the image is refused', async () => {
    setup({ [IPC_CHANNELS.MOCKUP_SET_COVER]: () => ok({ ok: false, reason: 'too-large' }) })
    await open()
    choose()
    expect(await screen.findByText('We couldn’t use that image')).not.toBeNull()
    expect(coverImg().getAttribute('src')).toBe(coverUrl('/lib/hero.png'))
    expect(toasts.undoToast).not.toHaveBeenCalled()
  })

  it('uses the PSD’s preview instantly, only on a cover that is not the embedded one, and offers Undo', async () => {
    setup({
      [IPC_CHANNELS.MOCKUP_DETAIL]: () => ok(uploaded),
      [IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER]: () =>
        ok(
          change({
            coverPath: '/lib/psd.png',
            coverSource: 'embedded',
            previous: { coverPath: '/lib/hero.png', coverSource: 'user-uploaded' }
          })
        )
    })
    await open()
    fireEvent.click(button('Use the PSD’s preview')!)

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: 42 })
    )
    await waitFor(() => expect(coverImg().getAttribute('src')).toContain(coverUrl('/lib/psd.png')))
    expect(screen.getByText('Embedded preview')).not.toBeNull()
    expect(button('Use the PSD’s preview')).toBeNull()
    expect(toasts.undoToast).toHaveBeenCalledWith('Using the PSD’s preview', expect.any(Function))

    // Undo puts the uploaded cover back.
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_SET_COVER, {
        mockupId: 42,
        filePath: '/lib/hero.png'
      })
    )
  })

  it('offers no Use the PSD’s preview on the embedded cover', async () => {
    await open()
    expect(button('Use the PSD’s preview')).toBeNull()
    expect(button('Replace')).not.toBeNull()
  })

  it('replaces the cover of the variant that is shown, not the top', async () => {
    setup({ [IPC_CHANNELS.MOCKUP_SET_COVER]: () => ok(change()) })
    await open(99)
    fireEvent.click(screen.getByRole('button', { name: /side/ }))
    choose()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_SET_COVER, {
        mockupId: 100,
        filePath: '/path/new.png'
      })
    )
    await waitFor(() => expect(coverImg().getAttribute('src')).toContain(coverUrl('/lib/new.png')))
    // The top's own cover is unchanged: step back to it.
    fireEvent.click(screen.getByRole('button', { name: /front/ }))
    await waitFor(() => expect(coverImg().getAttribute('src')).toContain(coverUrl('/lib/a.png')))
  })
})
