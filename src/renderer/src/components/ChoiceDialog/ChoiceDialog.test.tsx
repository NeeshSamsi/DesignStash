import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ChoiceDialog, type ChoiceDialogProps } from './ChoiceDialog'
import { CHOICE_DIALOG_CONTRACT } from './ChoiceDialog.types'


/** Buttons with a filled colour (primary or destructive); secondary and ghost are not filled. */
const filled = (root: ParentNode) =>
  [...root.querySelectorAll('[data-slot="button"]')].filter((b) =>
    ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
  )

describe('ChoiceDialog', () => {
  it.each(variantMatrix(CHOICE_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ChoiceDialog {...(props as ChoiceDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="ChoiceDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ChoiceDialog />)
    for (const text of Object.values<string>(CHOICE_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('lays out tertiary · secondary · primary with one filled button', () => {
    const { container } = render(<ChoiceDialog />)
    const labels = [...container.querySelectorAll('[data-slot="button"]')].map((b) => b.textContent)
    expect(labels).toEqual(['Cancel', 'Point only', 'Move files'])
    expect(filled(container)).toHaveLength(1)
  })

  it('fires each choice once', () => {
    const [t, s, p] = [vi.fn(), vi.fn(), vi.fn()]
    render(<ChoiceDialog open onTertiary={t} onSecondary={s} onPrimary={p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Point only' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move files' }))
    expect([t.mock.calls.length, s.mock.calls.length, p.mock.calls.length]).toEqual([0, 1, 1])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(t).toHaveBeenCalledTimes(1)
  })

  it('Esc takes the tertiary way out', () => {
    const [t, p] = [vi.fn(), vi.fn()]
    render(<ChoiceDialog open onTertiary={t} onPrimary={p} />)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(t).toHaveBeenCalledTimes(1)
    expect(p).not.toHaveBeenCalled()
  })

  it('focuses the tertiary action first and traps focus', async () => {
    render(<ChoiceDialog open onTertiary={vi.fn()} />)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const primary = screen.getByRole('button', { name: 'Move files' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    primary.focus()
    fireEvent.keyDown(primary, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
  })

  it('a destructive primary is the red one (Resume · Later · Discard)', () => {
    const { container } = render(
      <ChoiceDialog tertiaryLabel="Resume" secondaryLabel="Later" primaryLabel="Discard" destructive />
    )
    const [button] = filled(container)
    expect(button!.getAttribute('data-variant')).toBe('destructive')
    expect(button!.textContent).toBe('Discard')
  })
})
