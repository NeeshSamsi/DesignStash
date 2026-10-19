import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ProgressDialog, type ProgressDialogProps } from './ProgressDialog'
import { PROGRESS_DIALOG_CONTRACT } from './ProgressDialog.types'


/** Buttons with a filled colour (primary or destructive); secondary and ghost are not filled. */
const filled = (root: ParentNode) =>
  [...root.querySelectorAll('[data-slot="button"]')].filter((b) =>
    ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
  )

describe('ProgressDialog', () => {
  it.each(variantMatrix(PROGRESS_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ProgressDialog {...(props as ProgressDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="ProgressDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ProgressDialog />)
    for (const text of Object.values<string>(PROGRESS_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('running is blocking: Esc is ignored and Cancel is the exit', () => {
    const onCancel = vi.fn()
    const onClose = vi.fn()
    render(<ProgressDialog open state="running" onCancel={onCancel} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancelling disables the button and shows why', () => {
    render(<ProgressDialog open state="cancelling" />)
    expect((screen.getByRole('button', { name: 'Cancelling…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('done offers Done as the only filled button', () => {
    const onDone = vi.fn()
    render(<ProgressDialog open state="done" onDone={onDone} />)
    expect(filled(document.body)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('failed offers Close and Retry, and Esc closes', () => {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    render(<ProgressDialog open state="failed" onClose={onClose} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the real progress line and percentage', () => {
    render(<ProgressDialog state="running" progressLabel="Copying 3 of 40" percent={7.5} />)
    expect(screen.getByText('Copying 3 of 40')).toBeTruthy()
    expect(screen.getByText('8%')).toBeTruthy()
  })
})
