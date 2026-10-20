import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { filterChips } from '@renderer/lib/tag-filter'
import { LibraryToolbar, type LibraryToolbarProps } from './LibraryToolbar'
import { LIBRARY_TOOLBAR_CONTRACT } from './LibraryToolbar.types'

describe('LibraryToolbar', () => {
  it.each(variantMatrix(LIBRARY_TOOLBAR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<LibraryToolbar {...(props as LibraryToolbarProps)} />)
    expect(baseElement.querySelector('[data-ds="LibraryToolbar"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<LibraryToolbar />)
    for (const text of Object.values<string>(LIBRARY_TOOLBAR_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('shows the stats', () => {
    render(<LibraryToolbar stats="3 items" />)
    expect(screen.getByText('3 items')).toBeTruthy()
  })

  it('has no chips or Clear while nothing is picked', () => {
    const { container } = render(<LibraryToolbar chips={[]} />)
    expect(container.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('shows the count, a chip per pick and Clear, and each reports', () => {
    const onClear = vi.fn()
    const onRemove = vi.fn()
    render(
      <LibraryToolbar
        chips={[
          { key: 1, category: 'Device', label: 'iPhone', onRemove },
          { key: 2, label: 'Style' }
        ]}
        onClearFilters={onClear}
      />
    )
    expect(screen.getByLabelText('2 filters').textContent).toBe('2')
    expect(screen.getByText('Device')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Device iPhone' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Remove Style' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('the Filter button opens the tag filter popover', () => {
    render(
      <LibraryToolbar
        tagFilter={{ categories: [{ categoryId: 1, categoryLabel: 'Device', tags: [{ tagId: 1, label: 'iPhone' }] }] }}
      />
    )
    expect(screen.queryByLabelText('Search tags')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getByLabelText('Search tags')).toBeTruthy()
  })

  it('offers the two sorts from the Select, defaulting to Date added', () => {
    render(<LibraryToolbar />)
    const trigger = screen.getByRole('combobox', { name: 'Sort order' })
    expect(trigger.textContent).toContain('Date added')
  })

  it('has one filled colour at most outside the active count', () => {
    const { container } = render(<LibraryToolbar chips={[]} />)
    const filled = [...container.querySelectorAll('[data-slot="button"]')].filter((b) =>
      ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
    )
    expect(filled).toHaveLength(0)
  })

  it('a picked category is one “All in Device” chip, and × removes the category', () => {
    const onRemoveCategory = vi.fn()
    const chips = filterChips(
      [{ categoryId: 1, categoryLabel: 'Device', tags: [{ tagId: 10, label: 'iPhone' }] }],
      { tagIds: [], categoryIds: [1] },
      { onRemoveTag: vi.fn(), onRemoveCategory }
    )
    render(<LibraryToolbar chips={chips} />)
    expect(screen.getByLabelText('1 filters').textContent).toBe('1')
    expect(screen.getByText('All in Device')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove All in Device' }))
    expect(onRemoveCategory).toHaveBeenCalledWith(1)
  })
})
