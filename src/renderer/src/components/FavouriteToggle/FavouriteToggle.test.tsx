import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { FavouriteToggle, type FavouriteToggleProps } from './FavouriteToggle'
import { FAVOURITE_TOGGLE_CONTRACT } from './FavouriteToggle.types'

describe('FavouriteToggle', () => {
  it.each(variantMatrix(FAVOURITE_TOGGLE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<FavouriteToggle {...(props as FavouriteToggleProps)} />)
    expect(baseElement.querySelector('[data-ds="FavouriteToggle"]')).not.toBeNull()
  })
})

describe('FavouriteToggle behaviour', () => {
  it('reports the new value on click and reflects pressed', () => {
    const onPressedChange = vi.fn()
    const { rerender } = render(<FavouriteToggle onPressedChange={onPressedChange} />)
    const button = screen.getByRole('button', { name: 'Star' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(onPressedChange).toHaveBeenCalledWith(true)
    rerender(<FavouriteToggle pressed onPressedChange={onPressedChange} />)
    expect(screen.getByRole('button', { name: 'Remove star' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  it('skips onPressedChange when onClick prevents default', () => {
    const onPressedChange = vi.fn()
    render(
      <FavouriteToggle
        onClick={(event) => event.preventDefault()}
        onPressedChange={onPressedChange}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onPressedChange).not.toHaveBeenCalled()
  })
})
