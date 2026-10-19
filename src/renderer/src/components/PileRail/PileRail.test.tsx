import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PileRail, type PileRailProps } from './PileRail'
import { PILE_RAIL_CONTRACT } from './PileRail.types'

describe('PileRail', () => {
  it.each(variantMatrix(PILE_RAIL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PileRail {...(props as PileRailProps)} />)
    expect(baseElement.querySelector('[data-ds="PileRail"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<PileRail />)
    for (const text of Object.values<string>(PILE_RAIL_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
