import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

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

  it('⌘Z runs the newest live Undo once, even with focus trapped elsewhere', () => {
    const first = vi.fn()
    const second = vi.fn()
    undoToast('One', first)
    mount(0, 'a')
    undoToast('Two', second)
    mount(1, 'b')
    const press = () =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
      )
    press()
    press()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1)
    press()
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('⌘Z is left to text fields', () => {
    const onUndo = vi.fn()
    undoToast('Moved', onUndo)
    mount(0, 'c')
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    expect(onUndo).not.toHaveBeenCalled()
    input.remove()
  })

  it('a dismissed Undo toast no longer answers ⌘Z', () => {
    const onUndo = vi.fn()
    undoToast('Moved', onUndo)
    const options = sonner.custom.mock.calls.at(-1)![1] as {
      onDismiss: (t: { id: string }) => void
    }
    mount(0, 'd')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    options.onDismiss({ id: 'd' })
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    expect(onUndo).not.toHaveBeenCalled()
  })
})
