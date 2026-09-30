import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { FavouriteToggle, type FavouriteToggleProps } from './FavouriteToggle'
import { FAVOURITE_TOGGLE_CONTRACT } from './FavouriteToggle.types'

describe('FavouriteToggle', () => {
  it.each(variantMatrix(FAVOURITE_TOGGLE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<FavouriteToggle {...(props as FavouriteToggleProps)} />)
    expect(baseElement.querySelector('[data-ds="FavouriteToggle"]')).not.toBeNull()
  })
})
