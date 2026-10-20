import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { FilterCategory } from '@renderer/lib/tag-filter'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TagFilterPopover, type TagFilterPopoverProps } from './TagFilterPopover'
import { TAG_FILTER_POPOVER_CONTRACT } from './TagFilterPopover.types'

describe('TagFilterPopover', () => {
  it.each(variantMatrix(TAG_FILTER_POPOVER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TagFilterPopover {...(props as TagFilterPopoverProps)} />)
    expect(baseElement.querySelector('[data-ds="TagFilterPopover"]')).not.toBeNull()
  })

  const CATEGORIES: FilterCategory[] = [
    {
      categoryId: 1,
      categoryLabel: 'Device',
      tags: [
        { tagId: 10, label: 'iPhone', count: 24 },
        { tagId: 11, label: 'iPad', count: 8 }
      ]
    },
    { categoryId: 2, categoryLabel: 'Style', tags: [{ tagId: 20, label: 'Clay', count: 12 }] },
    { categoryId: 3, categoryLabel: 'Colour', tags: [{ tagId: 30, label: 'Clear', count: 2 }] }
  ]
  const search = () => screen.getByLabelText('Search tags') as HTMLInputElement
  const pills = () =>
    within(screen.getByRole('group', { name: 'Narrow by category' }))
      .getAllByRole('button')
      .map((b) => b.textContent)

  it('filters the tag list live and updates the category counts', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    expect(pills()).toEqual(['All', 'Device2', 'Style1', 'Colour1'])
    fireEvent.change(search(), { target: { value: 'cl' } })
    expect(screen.queryByText('iPhone')).toBeNull()
    expect(screen.queryByText('Device', { selector: 'h4' })).toBeNull()
    expect(screen.getByText('Clay')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
    expect(pills()).toEqual(['All2', 'Style1', 'Colour1'])
  })

  it('narrows the list to a category from its pill, and All brings everything back', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    fireEvent.click(screen.getByRole('button', { name: /^Style/ }))
    expect(screen.getByText('Clay')).toBeTruthy()
    expect(screen.queryByText('iPhone')).toBeNull()
    expect(screen.getByRole('button', { name: /^Style/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(screen.getByText('iPhone')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('falls back to All when a search empties the chosen category', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    fireEvent.click(screen.getByRole('button', { name: /^Style/ }))
    fireEvent.change(search(), { target: { value: 'iphone' } })
    expect(screen.getByText('iPhone')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the All count only while searching', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    expect(pills()[0]).toBe('All')
    fireEvent.change(search(), { target: { value: 'i' } })
    expect(pills()[0]).toMatch(/^All\d+$/)
  })

  it('ticks tags and reports them; every picked tag is kept (AND)', () => {
    const onChange = vi.fn()
    render(<TagFilterPopover categories={CATEGORIES} selectedTagIds={[10]} onSelectedTagIdsChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Clay/ }))
    expect(onChange).toHaveBeenLastCalledWith([10, 20])
    fireEvent.click(screen.getByRole('checkbox', { name: /iPhone/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('Clear all is off until something is picked, then clears the picks', () => {
    const onChange = vi.fn()
    const { rerender } = render(<TagFilterPopover categories={CATEGORIES} />)
    expect((screen.getByRole('button', { name: 'Clear all' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<TagFilterPopover categories={CATEGORIES} selectedTagIds={[10, 20]} onSelectedTagIdsChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('says what matched nothing, and the clear button resets the search', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    fireEvent.change(search(), { target: { value: 'xyz' } })
    expect(screen.getByText('No tags match “xyz”')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Narrow by category' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(search().value).toBe('')
    expect(screen.getByText('iPhone')).toBeTruthy()
  })

  it('has a way forward when there are no tags yet', () => {
    const onManageTags = vi.fn()
    render(<TagFilterPopover categories={[]} onManageTags={onManageTags} />)
    expect(screen.getByText('No tags yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }))
    expect(onManageTags).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Search tags')).toBeNull()
  })

  it('is flat: one level of tags under each category, no parent hint, no shortcut hint', () => {
    const { container } = render(<TagFilterPopover categories={CATEGORIES} />)
    expect(container.textContent).not.toMatch(/parent|children|⌘K/i)
    const group = screen.getByRole('group', { name: 'Device' })
    for (const row of within(group).getAllByRole('checkbox')) {
      expect(row.closest('[data-ds="Checkbox"]')!.parentElement).toBe(group)
    }
  })

  it('scrolls the list past the token height', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    const list = screen.getByRole('group', { name: 'Device' }).parentElement!
    expect(list.className).toContain('max-h-tag-filter')
    expect(list.className).toContain('overflow-y-auto')
  })

  it('searches with a placeholder that counts the tags', () => {
    render(<TagFilterPopover categories={CATEGORIES} />)
    expect(search().placeholder).toBe('Search 4 tags')
  })

  it('the catalog sample shows each state', () => {
    const some = render(<TagFilterPopover state="some-selected" />)
    expect(
      screen.getAllByRole('checkbox').filter((c) => c.getAttribute('aria-checked') === 'true')
    ).toHaveLength(2)
    some.unmount()
    const searching = render(<TagFilterPopover state="searching" />)
    expect(search().value).toBe('cl')
    searching.unmount()
    render(<TagFilterPopover state="no-match" />)
    expect(screen.getByText(/No tags match/)).toBeTruthy()
  })
})
