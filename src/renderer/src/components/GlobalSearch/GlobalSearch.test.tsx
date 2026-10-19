import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { GlobalSearch, SEARCH_DEBOUNCE_MS, type GlobalSearchProps } from './GlobalSearch'
import { GLOBAL_SEARCH_CONTRACT } from './GlobalSearch.types'

describe('GlobalSearch', () => {
  it.each(variantMatrix(GLOBAL_SEARCH_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<GlobalSearch {...(props as GlobalSearchProps)} />)
    expect(baseElement.querySelector('[data-ds="GlobalSearch"]')).not.toBeNull()
  })

  describe('behaviour', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const type = (text: string) =>
      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: text } })

    it('reports the query 250 ms after typing stops', () => {
      const onQueryChange = vi.fn()
      render(<GlobalSearch onQueryChange={onQueryChange} />)
      type('ph')
      act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1))
      type('phone')
      act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1))
      expect(onQueryChange).not.toHaveBeenCalled()
      act(() => void vi.advanceTimersByTime(1))
      expect(onQueryChange).toHaveBeenCalledTimes(1)
      expect(onQueryChange).toHaveBeenCalledWith('phone')
    })

    it('uses 250 ms', () => {
      expect(SEARCH_DEBOUNCE_MS).toBe(250)
    })

    it('focuses the field on ⌘K', () => {
      render(<GlobalSearch />)
      const input = screen.getByRole('textbox', { name: 'Search' })
      expect(document.activeElement).not.toBe(input)
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      expect(document.activeElement).toBe(input)
    })

    it('ignores K without ⌘', () => {
      render(<GlobalSearch />)
      fireEvent.keyDown(window, { key: 'k' })
      expect(document.activeElement).toBe(document.body)
    })

    it('Esc clears at once, then blurs on an empty field', () => {
      const onQueryChange = vi.fn()
      render(<GlobalSearch defaultQuery="clay" onQueryChange={onQueryChange} />)
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
      input.focus()
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input.value).toBe('')
      expect(onQueryChange).toHaveBeenCalledWith('')
      expect(document.activeElement).toBe(input)
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(document.activeElement).not.toBe(input)
    })

    it('does not report a stale query after Esc clears', () => {
      const onQueryChange = vi.fn()
      render(<GlobalSearch onQueryChange={onQueryChange} />)
      const input = screen.getByRole('textbox', { name: 'Search' })
      type('clay')
      fireEvent.keyDown(input, { key: 'Escape' })
      act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2))
      expect(onQueryChange).toHaveBeenCalledTimes(1)
      expect(onQueryChange).toHaveBeenCalledWith('')
    })
  })
})
