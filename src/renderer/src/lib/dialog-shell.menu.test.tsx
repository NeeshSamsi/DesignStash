import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DropdownMenu } from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem'
import { DialogFrame } from './dialog-shell'

function Harness({ onDismiss }: { onDismiss: () => void }) {
  return (
    <DialogFrame open dataDs="Probe" onDismiss={onDismiss}>
      <p>Inside the dialog</p>
      <DropdownMenu
        trigger={<button type="button">More</button>}
        items={<DropdownMenuItem label="Rename" />}
      />
    </DialogFrame>
  )
}

/** A mouse press, as Radix sees it: pointerdown, then pointerup and click. */
const press = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(el, { button: 0, pointerType: 'mouse' })
  fireEvent.click(el)
}

const openMenu = async () => {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Enter' })
  await screen.findByRole('menuitem', { name: 'Rename' })
}

describe('a menu inside a dialog', () => {
  it('closes only the menu when pressed outside, and the dialog on the next press', async () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    await openMenu()

    // Outside the menu but inside the dialog, and out on the overlay.
    press(document.querySelector('[data-slot="dialog-overlay"]')!)
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull())
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByText('Inside the dialog')).toBeTruthy()

    // With no menu open, the same press dismisses the dialog.
    press(document.querySelector('[data-slot="dialog-overlay"]')!)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('Escape closes the menu first, not the dialog', async () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    await openMenu()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull())
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
