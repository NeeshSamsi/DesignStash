import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { EMPTY_STATE_CONTRACT } from './EmptyState.types'

describe('EmptyState', () => {
  it.each(variantMatrix(EMPTY_STATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<EmptyState {...(props as EmptyStateProps)} />)
    expect(baseElement.querySelector('[data-ds="EmptyState"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<EmptyState />)
    for (const text of Object.values<string>(EMPTY_STATE_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('always offers the primary action', () => {
    const onPrimary = vi.fn()
    render(<EmptyState onPrimary={onPrimary} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add mockups' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })

  it('has no secondary action unless asked for and labelled', () => {
    const { rerender } = render(<EmptyState />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    rerender(<EmptyState secondaryAction />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    rerender(<EmptyState secondaryAction secondaryLabel="Import from a folder" />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('is not vertically centred', () => {
    const { container } = render(<EmptyState />)
    const cls = container.querySelector('[data-ds="EmptyState"]')!.className
    expect(cls).not.toMatch(/h-full|justify-center|my-auto/)
  })

  it('leaves the button out when the state only explains itself (primaryLabel null)', () => {
    render(<EmptyState primaryLabel={null} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps the icon on a lone primary and drops it when a secondary sits beside it', () => {
    const { rerender } = render(<EmptyState />)
    const icons = () => screen.getByRole('button', { name: 'Add mockups' }).querySelectorAll('svg')
    expect(icons()).toHaveLength(1)
    rerender(<EmptyState secondaryAction secondaryLabel="Import from a folder" />)
    expect(icons()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Import from a folder' }).querySelector('svg')).toBeNull()
    // Light to heavy: the secondary first.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Import from a folder',
      'Add mockups'
    ])
  })
})
