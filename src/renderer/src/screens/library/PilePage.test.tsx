import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useDetailsEscape } from '../details/use-details-escape'
import { PilePage } from './PilePage'
import { item, resetStores, setupApi } from './library-test-utils'

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const variant = (id: number, isTop: boolean) => ({
  id,
  title: `V${id}`,
  coverPath: `/lib/${id}.png`,
  coverMissing: false,
  coverSource: 'embedded',
  isTop
})
const variants = [variant(2, false), variant(1, true), variant(3, false)]

const ok = (data: unknown) => ({ success: true, data })
const handlers = {
  [IPC_CHANNELS.MOCKUP_DETAIL]: (request: unknown) => {
    const id = (request as { mockupId: number }).mockupId
    const base = item(id, { title: `V${id}`, createdAt: '2026-10-12T09:00:00' })
    return ok({
      item: id === 1 ? { ...base, pile: { memberCount: 3 } } : base,
      variants: id === 1 ? variants : []
    })
  },
  [IPC_CHANNELS.PILE_DISBAND]: () => ok({ snapshot: { rows: [] }, freedIds: [1, 2, 3] }),
  [IPC_CHANNELS.PILE_REMOVE]: (request: unknown) => {
    const { mockupId } = request as { mockupId: number }
    return ok({ pileId: mockupId === 1 ? 2 : 1, snapshot: { rows: [] }, freedIds: [mockupId] })
  },
  [IPC_CHANNELS.PILE_SET_TOP]: () => ok({ pileId: 2, snapshot: { rows: [] } })
}

function Host({ select = 1, edit = false }: { select?: number; edit?: boolean }) {
  useDetailsEscape()
  return <PilePage pile={{ id: 1, title: 'V1', count: 3, select, edit }} />
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-mockup-id]')]
const ready = async () => {
  await waitFor(() => expect(cards()).toHaveLength(3))
}

beforeEach(() => {
  resetStores()
  useDetailEffects.setState({ revision: 0, pendingSelection: [] })
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
})

describe('PilePage', () => {
  it('lists the pile’s mockups as full cards, the top one first and marked Top', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    expect(cards().map((c) => c.getAttribute('data-mockup-id'))).toEqual(['1', '2', '3'])
    expect(cards()[0]!.textContent).toContain('Top')
    expect(cards()[1]!.textContent).not.toContain('Top')
  })

  it('titles each card by its variation, with a capital, under the pile’s base (D3.1)', async () => {
    const words: Record<number, string> = { 1: 'three-quarter', 2: 'side', 3: 'flat lay' }
    setupApi([], {
      ...handlers,
      [IPC_CHANNELS.MOCKUP_DETAIL]: (request: unknown) => {
        const id = (request as { mockupId: number }).mockupId
        const base = item(id, {
          title: 'Clay iPhone 15 Pro',
          pileId: 1,
          variation: { words: words[id]!, source: 'ai' }
        })
        return ok({
          item: id === 1 ? { ...base, pile: { memberCount: 3 } } : base,
          variants: id === 1 ? variants : []
        })
      }
    })
    useDetailsStore
      .getState()
      .openPile({ id: 1, title: 'Clay iPhone 15 Pro', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    expect(cards().map((c) => c.querySelector('p')?.textContent)).toEqual([
      'Three-quarter',
      'Side',
      'Flat lay'
    ])
  })

  it('arrives with the top mockup selected and showing in the sidebar', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    await waitFor(() => expect(useDetailsStore.getState().target).toEqual({ id: 1, edit: false }))
    expect(cards()[0]!.getAttribute('data-state')).toBe('selected')
  })

  it('arrives on the mockup that was clicked in the pile sidebar', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 3, edit: false })
    render(<Host select={3} />)
    await ready()
    await waitFor(() => expect(useDetailsStore.getState().target?.id).toBe(3))
  })

  it('arrives with the sidebar as fields for Edit pile details', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: true })
    render(<Host edit />)
    await ready()
    await waitFor(() => expect(useDetailsStore.getState().target).toEqual({ id: 1, edit: true }))
  })

  it('Esc closes the sidebar first, then goes back to My Stash', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    await waitFor(() => expect(useDetailsStore.getState().target).not.toBeNull())

    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(useDetailsStore.getState().target).toBeNull())
    expect(useDetailsStore.getState().pile).not.toBeNull()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useDetailsStore.getState().pile).toBeNull()
  })

  it('Esc with unsaved edits asks first and keeps the sidebar on Keep editing', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    await waitFor(() => expect(useDetailsStore.getState().target).not.toBeNull())
    act(() => useDetailsStore.getState().setDirty(true))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useDetailsStore.getState().ask).not.toBeNull()
    act(() => useDetailsStore.getState().keepEditing())
    expect(useDetailsStore.getState().target?.id).toBe(1)
    expect(useDetailsStore.getState().pile).not.toBeNull()
  })

  it('leaves Esc alone while a menu is open', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.contextMenu(cards()[1]!)
    await screen.findByRole('menu')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useDetailsStore.getState().pile).not.toBeNull()
  })

  it('has Disband pile and Edit pile details in the header', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names.indexOf('Edit pile details')).toBe(names.indexOf('Disband pile') + 1)
  })

  it('Disband pile breaks it up with an Undo toast and goes back', async () => {
    const api = setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Disband pile' }))
    await waitFor(() => expect(api.calls(IPC_CHANNELS.PILE_DISBAND)).toEqual([{ pileId: 1 }]))
    await waitFor(() => expect(useDetailsStore.getState().pile).toBeNull())
    expect(toasts.undoToast.mock.calls[0]![0]).toBe('Pile disbanded')
  })

  it('Edit pile details shows the top mockup as fields', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 2, edit: false })
    render(<Host select={2} />)
    await ready()
    await waitFor(() => expect(useDetailsStore.getState().target?.id).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'Edit pile details' }))
    await waitFor(() => expect(useDetailsStore.getState().target).toEqual({ id: 1, edit: true }))
  })

  it('the card menu puts a mockup on top (off for the top one)', async () => {
    const api = setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    await screen.findByRole('menu')
    expect(screen.getByRole('menuitem', { name: 'Put on top' }).getAttribute('aria-disabled')).toBe(
      'true'
    )
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    fireEvent.contextMenu(cards()[1]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Put on top' }))
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_SET_TOP)).toEqual([{ pileId: 1, topId: 2 }])
    )
    expect(toasts.undoToast.mock.calls[0]![0]).toBe('V2 is on top')
    expect(useDetailsStore.getState().pile).toMatchObject({ id: 2, select: 2 })
  })

  it('Remove from pile is instant with an Undo toast; a member leaves and the pile stays', async () => {
    const api = setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.contextMenu(cards()[2]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from pile' }))
    await waitFor(() =>
      expect(api.calls(IPC_CHANNELS.PILE_REMOVE)).toEqual([{ pileId: 1, mockupId: 3 }])
    )
    expect(toasts.undoToast.mock.calls[0]![0]).toBe('Removed from the pile')
    expect(useDetailsStore.getState().pile).toMatchObject({ id: 1 })
  })

  it('removing the top carries on with the next mockup as the pile', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.contextMenu(cards()[0]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from pile' }))
    await waitFor(() => expect(useDetailsStore.getState().pile).toMatchObject({ id: 2, select: 2 }))
  })

  it('a pile left with one mockup is gone: back to My Stash', async () => {
    setupApi([], {
      ...handlers,
      [IPC_CHANNELS.PILE_REMOVE]: () =>
        ok({ pileId: null, snapshot: { rows: [] }, freedIds: [1, 3] })
    })
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 2, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.contextMenu(cards()[2]!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from pile' }))
    await waitFor(() => expect(useDetailsStore.getState().pile).toBeNull())
  })

  it('goes back when the pile no longer exists', async () => {
    setupApi([], {
      ...handlers,
      [IPC_CHANNELS.MOCKUP_DETAIL]: () => ok({ item: item(1), variants: [] })
    })
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await waitFor(() => expect(useDetailsStore.getState().pile).toBeNull())
  })

  it('double-click does nothing and Space does nothing', async () => {
    setupApi([], handlers)
    useDetailsStore.getState().openPile({ id: 1, title: 'V1', count: 3, select: 1, edit: false })
    render(<Host />)
    await ready()
    fireEvent.doubleClick(cards()[1]!)
    fireEvent.keyDown(cards()[1]!, { key: ' ' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useDetailsStore.getState().pile).toMatchObject({ id: 1 })
    expect(within(cards()[1]!).getByRole('button', { name: 'Edit details' })).toBeTruthy()
  })
})
