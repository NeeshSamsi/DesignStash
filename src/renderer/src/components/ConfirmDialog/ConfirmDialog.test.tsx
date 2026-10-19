import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'
import { CONFIRM_DIALOG_CONTRACT } from './ConfirmDialog.types'


/** Buttons with a filled colour (primary or destructive); secondary and ghost are not filled. */
const filled = (root: ParentNode) =>
  [...root.querySelectorAll('[data-slot="button"]')].filter((b) =>
    ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
  )

describe('ConfirmDialog', () => {
  it.each(variantMatrix(CONFIRM_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ConfirmDialog {...(props as ConfirmDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="ConfirmDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ConfirmDialog />)
    for (const text of Object.values<string>(CONFIRM_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('has exactly one filled button, red when destructive', () => {
    for (const variant of ['neutral', 'destructive'] as const) {
      const { container, unmount } = render(<ConfirmDialog variant={variant} />)
      const buttons = filled(container)
      expect(buttons).toHaveLength(1)
      expect(buttons[0]!.getAttribute('data-variant')).toBe(variant === 'destructive' ? 'destructive' : 'default')
      unmount()
    }
  })

  it('covers “Discard your changes?”: Keep editing · Discard, no Save', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        variant="destructive"
        detail={false}
        title="Discard your changes?"
        description="Your edits to this mockup will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(filled(document.body)).toHaveLength(1)
    expect(filled(document.body)[0]!.textContent).toBe('Discard')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Esc cancels', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Cancel cancels once and does not confirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('focuses Cancel first, so Enter cannot confirm a destructive action by default', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open variant="destructive" onConfirm={onConfirm} onCancel={vi.fn()} />)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete for good' }))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms only when the destructive button itself is activated', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open variant="destructive" onConfirm={onConfirm} onCancel={vi.fn()} />)
    const confirm = screen.getByRole('button', { name: 'Delete for good' })
    confirm.focus()
    expect(document.activeElement).toBe(confirm)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('traps focus: Tab from the last button wraps to the first, Shift+Tab goes back', async () => {
    render(<ConfirmDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Disband pile' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('while working: shows the working label, disables both buttons and ignores Esc', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open working variant="destructive" onConfirm={vi.fn()} onCancel={onCancel} />)
    expect((screen.getByRole('button', { name: 'Deleting…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('names the consequence in the detail row', () => {
    render(<ConfirmDialog detailTitle="Clay iPhone 15 Pro" detailMeta="5 files · 184 MB" />)
    expect(screen.getByText('5 files · 184 MB')).toBeTruthy()
  })
})
