import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ActionBar, type ActionBarProps } from './ActionBar'
import { ACTION_BAR_CONTRACT } from './ActionBar.types'

/** Buttons with a filled colour (primary or destructive); secondary and ghost are not filled. */
const filled = (root: ParentNode) =>
  [...root.querySelectorAll('[data-slot="button"]')].filter((b) =>
    ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
  )

describe('ActionBar', () => {
  it.each(variantMatrix(ACTION_BAR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ActionBar {...(props as ActionBarProps)} />)
    expect(baseElement.querySelector('[data-ds="ActionBar"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ActionBar showStatus />)
    for (const text of Object.values<string>(ACTION_BAR_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('has at most one filled button in every variant', () => {
    for (const variant of ['modal', 'stepper', 'page'] as const) {
      const { container, unmount } = render(
        <ActionBar variant={variant} startLabel="Open in Photoshop" showPileShortcut showStatus />
      )
      expect(filled(container)).toHaveLength(1)
      unmount()
    }
  })

  it('lets the primary say what it acts on, and hides it when null', () => {
    const onPrimary = vi.fn()
    const { rerender } = render(<ActionBar primaryLabel="Restore 3" onPrimary={onPrimary} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore 3' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
    rerender(<ActionBar primaryLabel={null} />)
    expect(filled(document.body)).toHaveLength(0)
  })

  it('fires secondary and start actions', () => {
    const onCancel = vi.fn()
    const onStart = vi.fn()
    render(<ActionBar startLabel="Open in Photoshop" onStart={onStart} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open in Photoshop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not fire a disabled primary and keeps it reachable for its reason', () => {
    const onPrimary = vi.fn()
    render(
      <ActionBar
        primaryDisabled
        primaryDisabledReason="Pick at least one mockup"
        onPrimary={onPrimary}
      />
    )
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(onPrimary).not.toHaveBeenCalled()
    expect(save.parentElement?.getAttribute('tabindex')).toBe('0')
  })

  it('stepper offers Back, Finish later and the pile shortcut on demand', () => {
    render(
      <ActionBar variant="stepper" showPileShortcut pileShortcutLabel="Stash the other 2 too" />
    )
    for (const name of [
      'Back',
      'Skip for now',
      'Finish later',
      'Stash the other 2 too',
      'Stash & next'
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('shows status text only on request', () => {
    const { rerender } = render(<ActionBar />)
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    rerender(<ActionBar showStatus />)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })
})
