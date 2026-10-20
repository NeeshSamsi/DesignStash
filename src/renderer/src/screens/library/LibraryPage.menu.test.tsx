import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { useUiStore } from '@renderer/stores/uiStore'
import LibraryPage from './LibraryPage'
import { item, pile, resetStores, setupApi, ShortcutHost } from './library-test-utils'

vi.mock('@renderer/stores/toastStore', () => ({ toast: vi.fn(), undoToast: vi.fn() }))

const cards = () => [
  ...document.querySelectorAll<HTMLElement>('[data-ds="MockupCard"][data-mockup-id]')
]
const rows = () => screen.getAllByRole('menuitem').map((row) => row.textContent ?? '')

async function ready() {
  await waitFor(() =>
    expect(document.querySelector('[data-ds="MockupGrid"]')?.getAttribute('data-state')).not.toBe(
      'loading'
    )
  )
}

function page(props: Parameters<typeof LibraryPage>[0] = {}) {
  return render(
    <ShortcutHost>
      <LibraryPage {...props} />
    </ShortcutHost>
  )
}

const trashOk = {
  [IPC_CHANNELS.MOCKUP_TRASH]: (request: unknown) => ({
    success: true,
    data: { ok: true, count: (request as { ids: number[] }).ids.length }
  }),
  [IPC_CHANNELS.MOCKUP_RESTORE]: (request: unknown) => ({
    success: true,
    data: { ok: true, count: (request as { ids: number[] }).ids.length }
  })
}

beforeEach(() => {
  resetStores()
  vi.mocked(toast).mockClear()
  vi.mocked(undoToast).mockClear()
})

describe('card menu', () => {
  it('opens the same menu from right-click and the hover more button', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!, { clientX: 40, clientY: 50 })
    const fromRightClick = (await screen.findAllByRole('menuitem')).map((r) => r.textContent)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    fireEvent.pointerDown(cards()[0]!)
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /More actions for Mockup 1/ }))
    const fromMore = (await screen.findAllByRole('menuitem')).map((r) => r.textContent)
    expect(fromMore).toEqual(fromRightClick)
  })

  it('one card: Open in Photoshop, Edit details, Preview, Star, New pile (off), Move to Trash', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    await screen.findByRole('menu')
    expect(rows()).toEqual([
      'Open in Photoshop',
      'Edit details↵',
      'PreviewSpace',
      'Star',
      'New pile⌘G',
      'Move to Trash⌘⌫'
    ])
    expect(screen.getByRole('menuitem', { name: /New pile/ }).getAttribute('aria-disabled')).toBe(
      'true'
    )
  })

  it('right-click selects the card, and outside the selection switches to that card', async () => {
    setupApi([item(1), item(2), item(3)])
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    fireEvent.contextMenu(cards()[2]!)
    await screen.findByRole('menu')
    expect(screen.getByText('1 of 3 selected')).toBeTruthy()
    expect(cards()[2]!.getAttribute('data-state')).toBe('selected')
  })

  it('a selection: New pile from N, Star N, Preview, Move N to Trash', async () => {
    setupApi([item(1), item(2), item(3)])
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    fireEvent.contextMenu(cards()[1]!)
    await screen.findByRole('menu')
    expect(rows()).toEqual([
      'New pile from 2 mockups⌘G',
      'Star 2',
      'PreviewSpace',
      'Move 2 to Trash⌘⌫'
    ])
  })

  it('a pile: Disband pile and Move pile to Trash', async () => {
    setupApi([pile(1), item(2)])
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    await screen.findByRole('menu')
    expect(rows()).toEqual([
      'Open in Photoshop',
      'Edit details↵',
      'PreviewSpace',
      'Star',
      'Disband pile⇧⌘G',
      'Move pile to Trash'
    ])
  })

  it('empty space: Select all, Add files…, Add folder…, Undo', async () => {
    setupApi([item(1)])
    page({ onAddFiles: vi.fn(), onAddFolder: vi.fn() })
    await ready()
    fireEvent.contextMenu(document.querySelector('[data-ds="MockupGrid"]')!)
    await screen.findByRole('menu')
    expect(rows()).toEqual(['Select all⌘A', 'Add files…⌘O', 'Add folder…⇧⌘O', 'Undo⌘Z'])
    expect(screen.getByRole('menuitem', { name: /^Undo/ }).getAttribute('aria-disabled')).toBe(
      'true'
    )
  })

  it('Select all from the empty-space menu selects every mockup', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.contextMenu(document.querySelector('[data-ds="MockupGrid"]')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Select all/ }))
    expect(screen.getByText('2 of 2 selected')).toBeTruthy()
  })

  it('never offers Duplicate, Reveal in Finder or a bare Open', async () => {
    setupApi([item(1), pile(2), item(3)])
    page()
    await ready()
    for (const index of [0, 1]) {
      fireEvent.contextMenu(cards()[index]!)
      await screen.findByRole('menu')
      const labels = rows().join(' | ')
      expect(labels).not.toMatch(/duplicate|reveal|finder/i)
      expect(rows().some((label) => /^Open(?! in Photoshop)/.test(label))).toBe(false)
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    }
  })

  it('Open in Photoshop and Edit details from the menu use the hover words and actions', async () => {
    const api = setupApi([item(5)])
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open in Photoshop' }))
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL)).toEqual([{ mockupId: 5 }])
    )
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Edit details/ }))
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 5 })
  })

  it('Star from the menu stars every selected mockup', async () => {
    const api = setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Star 2' }))
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.MOCKUP_SET_FAVOURITE)).toEqual([
        { mockupId: 1, favourite: true },
        { mockupId: 2, favourite: true }
      ])
    )
  })
})

describe('trash', () => {
  it('moves to Trash instantly with Undo from the menu, Cmd+Backspace or Backspace', async () => {
    const api = setupApi([item(1), item(2)], trashOk)
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Move to Trash/ }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.MOCKUP_TRASH)).toEqual([{ ids: [1] }]))
    expect(useUiStore.getState().modal).toBeNull()
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1))
    expect(vi.mocked(undoToast).mock.calls[0]![0]).toBe('Moved to Trash')
  })

  it('Undo restores exactly what was trashed and reloads', async () => {
    const api = setupApi([item(1), item(2)], trashOk)
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!, { metaKey: true })
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1))
    expect(api.calls(IPC_CHANNELS.MOCKUP_TRASH)).toEqual([{ ids: [1, 2] }])
    const listsBefore = api.calls(IPC_CHANNELS.LIBRARY_LIST).length
    await act(async () => vi.mocked(undoToast).mock.calls[0]![1]())
    expect(api.calls(IPC_CHANNELS.MOCKUP_RESTORE)).toEqual([{ ids: [1, 2] }])
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST).length).toBeGreaterThan(listsBefore)
  })

  it('moves to Trash from Cmd+Backspace and Backspace, each with Undo', async () => {
    const api = setupApi([item(1), item(2), item(3)], trashOk)
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'Backspace' })
    await waitFor(() => expect(api.calls(IPC_CHANNELS.MOCKUP_TRASH)).toEqual([{ ids: [1] }]))
    fireEvent.click(cards()[1]!)
    cards()[1]!.focus()
    fireEvent.keyDown(cards()[1]!, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(api.calls(IPC_CHANNELS.MOCKUP_TRASH)).toHaveLength(2))
    expect(undoToast).toHaveBeenCalledTimes(2)
  })

  it('does nothing with nothing selected', async () => {
    const api = setupApi([item(1)], trashOk)
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'Backspace' })
    expect(api.calls(IPC_CHANNELS.MOCKUP_TRASH)).toHaveLength(0)
  })

  it('ignores Backspace while typing in a field', async () => {
    const api = setupApi([item(1)], trashOk)
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort order' }), { key: 'Backspace' })
    expect(api.calls(IPC_CHANNELS.MOCKUP_TRASH)).toHaveLength(0)
  })

  it('a failure says so and keeps the card', async () => {
    setupApi([item(1)], {
      [IPC_CHANNELS.MOCKUP_TRASH]: () => ({ success: false, error: { code: 'X', message: 'no' } })
    })
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Move to Trash/ }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(undoToast).not.toHaveBeenCalled()
    expect(cards()).toHaveLength(1)
  })

  it('the empty-space menu names the last change and can undo it', async () => {
    const api = setupApi([item(1)], trashOk)
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Move to Trash/ }))
    await waitFor(() => expect(undoToast).toHaveBeenCalled())
    fireEvent.contextMenu(document.querySelector('[data-ds="MockupGrid"]')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Undo move to Trash⌘Z' }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.MOCKUP_RESTORE)).toEqual([{ ids: [1] }]))
    // The toast's own Undo no longer repeats it.
    await act(async () => vi.mocked(undoToast).mock.calls[0]![1]())
    expect(api.calls(IPC_CHANNELS.MOCKUP_RESTORE)).toHaveLength(1)
  })
})

describe('keyboard', () => {
  it('opens Detail on double-click or Enter, not on a single click', async () => {
    setupApi([item(4)])
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    expect(useUiStore.getState().modal).toBeNull()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'Enter' })
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 4 })
    useUiStore.setState({ modal: null })
    fireEvent.doubleClick(cards()[0]!)
    expect(useUiStore.getState().modal).toEqual({ kind: 'detail', mockupId: 4 })
  })

  it('Enter on a button inside a card keeps that button’s own action', async () => {
    setupApi([item(4)])
    page()
    await ready()
    const edit = within(cards()[0]!).getByRole('button', { name: 'Edit details' })
    fireEvent.keyDown(edit, { key: 'Enter' })
    expect(useUiStore.getState().modal).toBeNull()
  })

  it('arrow keys move through the cards and Escape clears', async () => {
    setupApi([item(1), item(2), item(3)])
    page()
    await ready()
    fireEvent.click(cards()[0]!)
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'ArrowRight', shiftKey: true })
    expect(screen.getByText('2 of 3 selected')).toBeTruthy()
    fireEvent.keyDown(cards()[1]!, { key: 'Escape' })
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('Cmd+A selects every mockup', async () => {
    setupApi([item(1), item(2), item(3)])
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: 'a', metaKey: true })
    expect(screen.getByText('3 of 3 selected')).toBeTruthy()
  })
})

describe('fullscreen preview', () => {
  const lightbox = (name?: string | RegExp) => screen.findByRole('dialog', name ? { name } : {})

  it('opens from Space and steps with arrow keys in grid order', async () => {
    setupApi([item(1), item(2), item(3)])
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: ' ' })
    const dialog = await lightbox('Mockup 1')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(await lightbox('Mockup 2')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(await lightbox('Mockup 3')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'Mockup 3' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    expect(await lightbox('Mockup 2')).toBeTruthy()
  })

  it('opens from Preview in the card menu', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.contextMenu(cards()[1]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Preview/ }))
    expect(await lightbox('Mockup 2')).toBeTruthy()
  })

  it('returns focus to the card when the fullscreen preview closes', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    cards()[1]!.focus()
    fireEvent.keyDown(cards()[1]!, { key: ' ' })
    fireEvent.keyDown(await lightbox('Mockup 2'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(cards()[1]!))
  })

  it('returns focus to the card when opened from the menu too', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Preview/ }))
    fireEvent.keyDown(await lightbox('Mockup 1'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(cards()[0]!))
  })

  it('opens the fullscreen preview from Space or Preview in the card menu and steps with arrow keys in grid order', async () => {
    setupApi([item(1), item(2)])
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: ' ' })
    fireEvent.keyDown(await lightbox('Mockup 1'), { key: 'ArrowRight' })
    expect(await lightbox('Mockup 2')).toBeTruthy()
  })

  it('steps through a pile’s variants, then on to the next card', async () => {
    setupApi([pile(1), item(2)], {
      [IPC_CHANNELS.MOCKUP_DETAIL]: () => ({
        success: true,
        data: {
          item: pile(1),
          variants: [
            { id: 1, title: 'Variant A', coverPath: '/a.webp', coverMissing: false, isTop: true },
            { id: 11, title: 'Variant B', coverPath: '/b.webp', coverMissing: false, isTop: false }
          ]
        }
      })
    })
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: ' ' })
    expect(await lightbox('Variant A')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(await lightbox('Variant B')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(await lightbox('Mockup 2')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    expect(await lightbox('Variant B')).toBeTruthy()
  })

  it('a missing file offers Check library, which checks the stash', async () => {
    const api = setupApi([item(1, { coverMissing: true })], {
      [IPC_CHANNELS.STASH_CHECK_RUN]: () => ({
        success: true,
        data: {
          lastRun: { at: '2026-10-20T02:41:00.000Z', trigger: 'manual', result: 'in-sync', toReview: 0 }
        }
      })
    })
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: ' ' })
    fireEvent.click(await screen.findByRole('button', { name: 'Check library' }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.STASH_CHECK_RUN)).toHaveLength(1))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: 'success', message: 'Your stash is in sync' })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Check library opens the reconcile view when the check finds something', async () => {
    setupApi([item(1, { coverMissing: true })], {
      [IPC_CHANNELS.STASH_CHECK_RUN]: () => ({
        success: true,
        data: {
          lastRun: { at: '2026-10-20T02:41:00.000Z', trigger: 'manual', result: 'review', toReview: 1 }
        }
      })
    })
    page()
    await ready()
    cards()[0]!.focus()
    fireEvent.keyDown(cards()[0]!, { key: ' ' })
    fireEvent.click(await screen.findByRole('button', { name: 'Check library' }))
    await waitFor(() => expect(useUiStore.getState().modal).toMatchObject({ kind: 'reconcile' }))
  })

  it('does not open from Space while a button inside the card has focus', async () => {
    setupApi([item(1)])
    page()
    await ready()
    const edit = within(cards()[0]!).getByRole('button', { name: 'Edit details' })
    fireEvent.keyDown(edit, { key: ' ' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
