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
    expect(document.querySelector('[data-ds="Toast"]')?.getAttribute('data-variant')).toBe('success')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
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
})
