import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { FormDialog, type FormDialogProps } from './FormDialog'
import { FORM_DIALOG_CONTRACT } from './FormDialog.types'

/** Buttons with a filled colour (primary or destructive); secondary and ghost are not filled. */
const filled = (root: ParentNode) =>
  [...root.querySelectorAll('[data-slot="button"]')].filter((b) =>
    ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
  )

describe('FormDialog', () => {
  it.each(variantMatrix(FORM_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<FormDialog {...(props as FormDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="FormDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<FormDialog />)
    for (const text of Object.values<string>(FORM_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('submits on Enter / submit and cancels on Esc', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(
      <FormDialog open onSubmit={onSubmit} onCancel={onCancel}>
        <input aria-label="Name" />
      </FormDialog>
    )
    fireEvent.submit(screen.getByLabelText('Name'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('invalid shows the error in words', () => {
    render(<FormDialog state="invalid" />)
    expect(screen.getByText('A category with this name already exists.')).toBeTruthy()
  })

  it('submitting disables submit, swaps the label and does not resubmit', () => {
    const onSubmit = vi.fn()
    render(
      <FormDialog open state="submitting" onSubmit={onSubmit}>
        <input aria-label="Name" />
      </FormDialog>
    )
    const button = screen.getByRole('button', { name: 'Creating…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.submit(screen.getByLabelText('Name'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('server errors appear in a Banner that can retry', () => {
    const onSubmit = vi.fn()
    render(
      <FormDialog open state="error" errorTitle="Couldn’t rename the tag" onSubmit={onSubmit} />
    )
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t rename the tag')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('has exactly one filled button', () => {
    const { container } = render(<FormDialog state="error" />)
    expect(filled(container)).toHaveLength(1)
  })

  it('a live form shows its own fields, not the catalog sample', () => {
    render(
      <FormDialog open>
        <input aria-label="Mine" />
      </FormDialog>
    )
    expect(screen.getByLabelText('Mine')).toBeTruthy()
    expect(screen.queryByText('Name')).toBeNull()
  })
})
