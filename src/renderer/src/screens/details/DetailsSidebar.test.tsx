import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { shortcuts } from '@renderer/lib/shortcuts'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { DetailsSidebar, DiscardAsk } from './DetailsSidebar'

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
    createdAt: `${new Date().getFullYear()}-10-12T09:00:00`,
    variantCount: 0,
    topId: null,
    tags: [{ id: 7, label: 'Clay', categoryLabel: 'Style' }]
  },
  variants: []
}

const pile = {
  item: { ...single.item, id: 99, title: 'Login Pile', isGroup: true, variantCount: 2, topId: 99 },
  variants: [
    { id: 100, title: 'side', coverPath: '/lib/b.png', coverMissing: false, isTop: false },
    { id: 99, title: 'front', coverPath: '/lib/a.png', coverMissing: false, isTop: true },
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
type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>
let uninstall: () => void

function setup(overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.MOCKUP_DETAIL]: (p) =>
      ok((p as { mockupId: number }).mockupId === 99 ? pile : single),
    [IPC_CHANNELS.TAG_TREE]: () => ok({ tree }),
    [IPC_CHANNELS.MOCKUP_UPDATE]: () => ok({ updated: true }),
    [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: () => ok({ opened: true }),
    [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: (p) =>
      ok({ favourite: (p as { favourite: boolean }).favourite }),
    [IPC_CHANNELS.PILE_DISBAND]: () => ok({ snapshot: { rows: [] }, freedIds: [99, 100, 101] }),
    [IPC_CHANNELS.LIBRARY_LIST]: () => ok({ items: [] }),
    [IPC_CHANNELS.LIBRARY_STATS]: () => ok({ total: 0, favourites: 0, groups: 0, trashed: 0 }),
    ...overrides
  }
  invoke = vi.fn(async (channel: string, payload: unknown) => {
    const handler = handlers[channel]
    return handler ? handler(payload) : ok({})
  })
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
}
const calls = (channel: string) => invoke.mock.calls.filter(([name]) => name === channel)

async function show(id = 42) {
  const view = render(
    <>
      <DetailsSidebar />
      <DiscardAsk />
    </>
  )
  act(() => useDetailsStore.getState().syncTarget(id))
  await screen.findByRole('button', { name: 'Close' })
  return view
}
const button = (name: string | RegExp) => screen.queryByRole('button', { name })
const buttons = () =>
  screen.getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))

beforeEach(() => {
  setup()
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
  useDetailEffects.setState({ revision: 0, pendingSelection: [] })
  useLibraryStore.getState().reset()
  useDetailsStore.getState().closePile()
  useDetailsStore.getState().syncTarget(null)
  useDetailsStore.getState().keepEditing()
  uninstall = shortcuts.install()
})
afterEach(() => uninstall())

describe('details sidebar · one mockup, read-only', () => {
  it('shows the title, caption, cover, description and tags, with Edit above Open in Photoshop', async () => {
    await show()
    await screen.findByText('Hero Screen')
    expect(screen.getByText('Mockup · added 12 Oct')).not.toBeNull()
    expect(screen.getByText('The main hero mockup')).not.toBeNull()
    expect(screen.getByText('Clay')).not.toBeNull()
    expect(button('Full screen')).not.toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    const names = buttons()
    expect(names.indexOf('Edit')).toBeGreaterThan(-1)
    expect(names.indexOf('Open in Photoshop')).toBe(names.indexOf('Edit') + 1)
    expect(button('Save')).toBeNull()
  })

  it('puts the star and ✕ on the title row, after the text', async () => {
    await show()
    await screen.findByText('Hero Screen')
    const close = button('Close')!
    const row = close.parentElement!
    expect(row.className).toContain('items-center')
    expect(within(row).getByRole('button', { name: /Star Hero Screen/ })).not.toBeNull()
  })

  it('stars the mockup', async () => {
    await show()
    await screen.findByText('Hero Screen')
    fireEvent.click(button(/Star Hero Screen/)!)
    await waitFor(() => expect(calls(IPC_CHANNELS.MOCKUP_SET_FAVOURITE)).toHaveLength(1))
    expect(calls(IPC_CHANNELS.MOCKUP_SET_FAVOURITE)[0]![1]).toEqual({
      mockupId: 42,
      favourite: true
    })
  })

  it('opens in Photoshop, and offers another try when it does not open', async () => {
    setup({ [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: () => ok({ opened: false, reason: 'no-app' }) })
    await show()
    await screen.findByText('Hero Screen')
    fireEvent.click(button('Open in Photoshop')!)
    const ask = await screen.findByRole('alertdialog')
    expect(within(ask).getByText('Photoshop isn’t installed')).not.toBeNull()
    fireEvent.click(within(ask).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)).toHaveLength(2))
  })

  it('opens the full-screen viewer from the cover', async () => {
    await show()
    await screen.findByText('Hero Screen')
    fireEvent.click(button('Full screen')!)
    expect(await screen.findByRole('dialog')).not.toBeNull()
  })

  it('closes with ✕ and clears the page selection', async () => {
    const clear = vi.fn()
    useDetailsStore.getState().setClearSelection(clear)
    await show()
    await screen.findByText('Hero Screen')
    fireEvent.click(button('Close')!)
    expect(clear).toHaveBeenCalledOnce()
    expect(useDetailsStore.getState().target).toBeNull()
  })

  it('shows an inline error with Try again when it cannot be read', async () => {
    setup({
      [IPC_CHANNELS.MOCKUP_DETAIL]: () => ({ success: false, error: { code: 'X', message: 'x' } })
    })
    await show()
    expect(await screen.findByText('Couldn’t open this mockup')).not.toBeNull()
    expect(button('Try again')).not.toBeNull()
  })
})

describe('details sidebar · editing', () => {
  async function edit() {
    await show()
    await screen.findByText('Hero Screen')
    fireEvent.click(button('Edit')!)
    return (await screen.findByRole('textbox', { name: 'Title' })) as HTMLInputElement
  }

  it('turns into fields with Cancel above Save, and Save waits for a change', async () => {
    const title = await edit()
    expect(title.value).toBe('Hero Screen')
    expect(screen.getByRole('textbox', { name: 'Description' })).not.toBeNull()
    const names = buttons()
    expect(names.indexOf('Save')).toBe(names.indexOf('Cancel') + 1)
    expect(button('Edit')).toBeNull()
    expect((button('Save') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(title, { target: { value: 'Hero Screen 2' } })
    expect((button('Save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('saves, goes back to reading, and tells the page', async () => {
    let saved: string | null = null
    setup({
      [IPC_CHANNELS.MOCKUP_UPDATE]: (p) => {
        saved = (p as { title: string }).title
        return ok({ updated: true })
      },
      [IPC_CHANNELS.MOCKUP_DETAIL]: () =>
        ok(saved ? { ...single, item: { ...single.item, title: saved } } : single)
    })
    const title = await edit()
    fireEvent.change(title, { target: { value: 'Hero Screen 2' } })
    fireEvent.click(button('Save')!)
    await waitFor(() => expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)).toHaveLength(1))
    expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)[0]![1]).toMatchObject({
      mockupId: 42,
      title: 'Hero Screen 2'
    })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull())
    expect(screen.getByText('Hero Screen 2')).not.toBeNull()
    expect(toasts.toast).toHaveBeenCalledWith('Saved your changes', 'success')
  })

  it('says why Save is off when the title is emptied', async () => {
    const title = await edit()
    fireEvent.change(title, { target: { value: '  ' } })
    expect((button('Save') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Add a title to save')).not.toBeNull()
  })

  it('keeps the edits and offers Save again when saving fails', async () => {
    setup({
      [IPC_CHANNELS.MOCKUP_UPDATE]: () => ({ success: false, error: { code: 'X', message: 'x' } })
    })
    const title = await edit()
    fireEvent.change(title, { target: { value: 'Nope' } })
    fireEvent.click(button('Save')!)
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(toasts.toast.mock.calls[0]![0]).toMatchObject({ variant: 'error' })
    expect(title.value).toBe('Nope')
    expect((button('Save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('Cancel without changes goes straight back to reading', async () => {
    await edit()
    fireEvent.click(button('Cancel')!)
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks before Cancel, ✕ or another card throws edits away; Keep editing keeps them', async () => {
    const title = await edit()
    fireEvent.change(title, { target: { value: 'Changed' } })

    fireEvent.click(button('Cancel')!)
    let ask = await screen.findByRole('alertdialog')
    expect(within(ask).getByText('Discard your changes?')).not.toBeNull()
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(title.value).toBe('Changed')
    expect(useDetailsStore.getState().target).toEqual({ id: 42, edit: true })

    fireEvent.click(button('Close')!)
    ask = await screen.findByRole('alertdialog')
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(useDetailsStore.getState().target?.id).toBe(42)

    // Another card is a way out too.
    act(() => useDetailsStore.getState().guard(() => useDetailsStore.getState().syncTarget(43)))
    ask = await screen.findByRole('alertdialog')
    fireEvent.click(within(ask).getByRole('button', { name: 'Discard' }))
    expect(useDetailsStore.getState().target?.id).toBe(43)
    expect(calls(IPC_CHANNELS.MOCKUP_UPDATE)).toHaveLength(0)
  })

  it('Discard on Cancel puts the saved values back', async () => {
    const title = await edit()
    fireEvent.change(title, { target: { value: 'Changed' } })
    fireEvent.click(button('Cancel')!)
    const ask = await screen.findByRole('alertdialog')
    fireEvent.click(within(ask).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull())
    expect(screen.getByText('Hero Screen')).not.toBeNull()
  })

  it('opens straight into fields when edit was asked for', async () => {
    useDetailsStore.getState().requestEdit(42)
    await show()
    expect(await screen.findByRole('textbox', { name: 'Title' })).not.toBeNull()
  })
})

describe('details sidebar · a pile', () => {
  it('lists the mockups, the top one first, under the pile’s title and count', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    expect(screen.getByText('Pile · 3 mockups')).not.toBeNull()
    const cards = document.querySelectorAll('[data-ds="MockupCard"]')
    expect(cards).toHaveLength(3)
    expect(cards[0]!.textContent).toContain('front')
    expect(cards[0]!.textContent).toContain('Top')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('has the expand icon before ✕, and Disband pile above Edit pile details', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    const names = buttons()
    expect(names.indexOf('Open pile page')).toBe(names.indexOf('Close') - 1)
    expect(names.indexOf('Edit pile details')).toBe(names.indexOf('Disband pile') + 1)
  })

  it('opens the pile page on the top mockup from the expand icon', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    fireEvent.click(button('Open pile page')!)
    expect(useDetailsStore.getState().pile).toEqual({
      id: 99,
      title: 'Login Pile',
      count: 3,
      select: 99,
      edit: false
    })
  })

  it('opens the pile page on the mockup that was clicked', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    const side = [...document.querySelectorAll('[data-ds="MockupCard"]')].find((c) =>
      c.textContent?.includes('side')
    )!
    fireEvent.click(side)
    expect(useDetailsStore.getState().pile?.select).toBe(100)
  })

  it('Edit pile details opens the page on the top mockup as fields', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    fireEvent.click(button('Edit pile details')!)
    expect(useDetailsStore.getState().pile).toMatchObject({ select: 99, edit: true })
  })

  it('opens a mockup of the pile in Photoshop from its card', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    const side = [...document.querySelectorAll('[data-ds="MockupCard"]')].find((c) =>
      c.textContent?.includes('side')
    )!
    fireEvent.click(within(side as HTMLElement).getByRole('button', { name: /Photoshop/ }))
    await waitFor(() => expect(calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)).toHaveLength(1))
    expect(calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)[0]![1]).toEqual({ mockupId: 100 })
    expect(useDetailsStore.getState().pile).toBeNull()
  })

  it('disbands instantly with an Undo toast', async () => {
    await show(99)
    await screen.findByText('Login Pile')
    fireEvent.click(button('Disband pile')!)
    await waitFor(() => expect(calls(IPC_CHANNELS.PILE_DISBAND)).toHaveLength(1))
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    expect(toasts.undoToast.mock.calls[0]![0]).toBe('Pile disbanded')
    expect(useDetailEffects.getState().pendingSelection).toEqual([99, 100, 101])
  })
})
