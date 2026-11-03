import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CategoryPill, type CategoryPillProps } from './CategoryPill'
import { CATEGORY_PILL_CONTRACT } from './CategoryPill.types'

describe('CategoryPill', () => {
  it.each(variantMatrix(CATEGORY_PILL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CategoryPill {...(props as CategoryPillProps)} />)
    expect(baseElement.querySelector('[data-ds="CategoryPill"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<CategoryPill />)
    for (const text of Object.values<string>(CATEGORY_PILL_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('is a toggle button: active is pressed, and a click reports it', () => {
    const onClick = vi.fn()
    const { rerender } = render(<CategoryPill label="Style" onClick={onClick} />)
    const pill = screen.getByRole('button', { name: /Style/ })
    expect(pill.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(pill)
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<CategoryPill label="Style" active />)
    expect(screen.getByRole('button', { name: /Style/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the count only when asked', () => {
    const { rerender } = render(<CategoryPill label="Device" count="5" />)
    expect(screen.getByText('5')).toBeTruthy()
    rerender(<CategoryPill label="Device" count="5" showCount={false} />)
    expect(screen.queryByText('5')).toBeNull()
  })
})
