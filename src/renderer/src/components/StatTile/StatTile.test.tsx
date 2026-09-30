import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { StatTile, type StatTileProps } from './StatTile'
import { STAT_TILE_CONTRACT } from './StatTile.types'

describe('StatTile', () => {
  it.each(variantMatrix(STAT_TILE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<StatTile {...(props as StatTileProps)} />)
    expect(baseElement.querySelector('[data-ds="StatTile"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<StatTile />)
    for (const text of Object.values<string>(STAT_TILE_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
