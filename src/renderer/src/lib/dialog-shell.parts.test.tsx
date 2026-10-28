import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Button } from '@renderer/components/Button'
import { DialogCancel, DialogDescription, DialogFrame, DialogTitle } from './dialog-shell'

// A dialog's title, description and Cancel come from the shell, which picks the right element for
// the frame around them: Radix's parts in a live dialog or alert, plain text in the static panel.

describe('the dialog parts', () => {
  it('name and describe a live dialog', () => {
    render(
      <DialogFrame open dataDs="Probe">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Your stash and app info.</DialogDescription>
      </DialogFrame>
    )
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const described = document.getElementById(dialog.getAttribute('aria-describedby')!)
    expect(described?.textContent).toBe('Your stash and app info.')
    expect(screen.getByText('Settings').className).toContain('sr-only')
  })

  it('name a live alert the same way', () => {
    render(
      <DialogFrame open alert dataDs="Probe">
        <DialogTitle>Empty Trash?</DialogTitle>
        <DialogCancel>
          <Button variant="secondary" size="sm">
            Cancel
          </Button>
        </DialogCancel>
      </DialogFrame>
    )
    expect(screen.getByRole('alertdialog', { name: 'Empty Trash?' })).toBeTruthy()
  })

  it('read as plain text in the static panel', () => {
    render(
      <DialogFrame dataDs="Probe">
        <DialogTitle>Empty Trash?</DialogTitle>
        <DialogDescription>3 mockups go for good.</DialogDescription>
      </DialogFrame>
    )
    expect(screen.getByText('Empty Trash?').tagName).toBe('P')
    expect(screen.getByText('3 mockups go for good.').tagName).toBe('P')
  })

  it('Cancel is the alert’s first focus, and closes it', async () => {
    const onDismiss = vi.fn()
    render(
      <DialogFrame open alert dataDs="Probe" onDismiss={onDismiss}>
        <DialogTitle>Empty Trash?</DialogTitle>
        <DialogCancel>
          <Button variant="secondary" size="sm">
            Cancel
          </Button>
        </DialogCancel>
        <Button variant="destructive" size="sm">
          Empty Trash
        </Button>
      </DialogFrame>
    )
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.getAttribute('data-ds')).toBe('Button')
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    fireEvent.click(cancel)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('Cancel is its button alone outside a live alert', () => {
    const onClick = vi.fn()
    render(
      <DialogFrame dataDs="Probe">
        <DialogCancel>
          <Button variant="secondary" size="sm" onClick={onClick}>
            Cancel
          </Button>
        </DialogCancel>
      </DialogFrame>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
