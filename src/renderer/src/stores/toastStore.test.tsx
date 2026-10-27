import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUndoRan } from '@renderer/lib/undo-router'

const sonner = vi.hoisted(() => ({
  custom: vi.fn(),
  dismiss: vi.fn()
}))
vi.mock('sonner', () => ({ toast: sonner }))

import { toast, undoToast } from './toastStore'

/** Render the element the store handed to Sonner. */
function mount(callIndex = 0, id = 'toast-1') {
  const factory = sonner.custom.mock.calls[callIndex]![0] as (id: string) => ReactElement
  return render(factory(id))
}

describe('toastStore', () => {
  beforeEach(() => {
    sonner.custom.mockReset()
    sonner.dismiss.mockReset()
  })

  it('keeps toast(message, kind) working', () => {
    toast('Saved', 'success')
    mount()
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(document.querySelector('[data-ds="Toast"]')?.getAttribute('data-variant')).toBe(
      'success'
    )
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('an Undo toast reads as a done action: the success check and a hairline Undo', () => {
    undoToast('Moved to Trash', () => {})
    mount()
    expect(document.querySelector('[data-ds="Toast"]')?.getAttribute('data-variant')).toBe(
      'success'
    )
    expect(screen.getByRole('button', { name: 'Undo' }).className).toContain('border-subtle')
  })

  it('shows a description only when given one', () => {
    toast({ message: 'Moved', description: 'Just now' })
    mount()
    expect(screen.getByText('Just now')).toBeTruthy()
  })

  it('fires the action once and dismisses', () => {
    const onClick = vi.fn()
    toast({ message: 'Moved', action: { label: 'Open', onClick } })
    mount()
    const button = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(sonner.dismiss).toHaveBeenCalledWith('toast-1')
  })

  it('undoToast offers Undo, calls onUndo once and dismisses', () => {
    const onUndo = vi.fn()
    undoToast('Moved to Trash', onUndo, '3 mockups')
    mount()
    expect(screen.getByText('3 mockups')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(sonner.dismiss).toHaveBeenCalledWith('toast-1')
  })

  it('the close button dismisses without running the action', () => {
    const onUndo = vi.fn()
    undoToast('Moved to Trash', onUndo)
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onUndo).not.toHaveBeenCalled()
    expect(sonner.dismiss).toHaveBeenCalledWith('toast-1')
  })

  it('leaves ⌘Z to the Edit menu: a toast never answers the key itself (undo.md)', () => {
    const onUndo = vi.fn()
    undoToast('Moved', onUndo)
    mount(0, 'c')
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    expect(onUndo).not.toHaveBeenCalled()
  })
})

describe('an Undo toast for an entry in the app’s history (undo.md)', () => {
  let push: ((payload: unknown) => void) | undefined
  let answer: unknown
  let invoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sonner.custom.mockReset()
    sonner.dismiss.mockReset()
    answer = { status: 'done', label: 'Move to Trash' }
    invoke = vi.fn(async () => ({ success: true, data: answer }))
    window.api = {
      invoke,
      subscribe: vi.fn((channel: string, fn: (payload: unknown) => void) => {
        if (channel === IPC_CHANNELS.UNDO_STATE) push = fn
        return () => {}
      })
    } as unknown as typeof window.api
  })

  const undo = () => screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement

  it('undoes its own entry through main, not the old closure, and the screens reload', async () => {
    const closure = vi.fn()
    const ran = vi.fn()
    const { unmount } = render(<Listener onRan={ran} />)
    undoToast('Moved to Trash', closure, undefined, 7)
    mount()
    fireEvent.click(undo())
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.UNDO_ENTRY, { id: 7 }))
    await waitFor(() => expect(ran).toHaveBeenCalledTimes(1))
    expect(closure).not.toHaveBeenCalled()
    unmount()
  })

  it('without an entry (a handler not recording yet) runs its closure as before', () => {
    const closure = vi.fn()
    undoToast('Moved to Trash', closure)
    mount()
    fireEvent.click(undo())
    expect(closure).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('is disabled, saying why, once a newer action touched the same things', async () => {
    undoToast('Moved to Trash', vi.fn(), 'Clay phone', 7)
    mount()
    expect(undo().disabled).toBe(false)
    act(() => push?.({ undoLabel: 'Star', entries: [{ id: 7, blockedBy: 9 }, { id: 9 }] }))
    await waitFor(() => expect(undo().disabled).toBe(true))
    expect(screen.getByText('Changed since. Use ⌘Z')).toBeTruthy()
    act(() => push?.({ entries: [{ id: 7 }] }))
    await waitFor(() => expect(undo().disabled).toBe(false))
    expect(screen.getByText('Clay phone')).toBeTruthy()
  })

  it('goes once its entry has left the history (undone with ⌘Z, or dropped)', async () => {
    undoToast('Moved to Trash', vi.fn(), undefined, 7)
    mount()
    act(() => push?.({ entries: [{ id: 7 }] }))
    expect(sonner.dismiss).not.toHaveBeenCalled()
    act(() => push?.({ redoLabel: 'Move to Trash', entries: [] }))
    await waitFor(() => expect(sonner.dismiss).toHaveBeenCalledWith('toast-1'))
  })
})

function Listener({ onRan }: { onRan: () => void }) {
  useUndoRan(onRan)
  return null
}
