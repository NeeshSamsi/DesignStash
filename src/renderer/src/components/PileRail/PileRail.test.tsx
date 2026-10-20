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

  it('lists the top mockup, variants and Review & stash pile as clickable steps', () => {
    render(<PileRail />)
    const steps = screen.getAllByRole('button').map((b) => b.textContent)
    expect(steps).toEqual([
      'Top · phone_front',
      'Variant · phone_side',
      'Variant · phone_back',
      'Variant · phone_top',
      'Review & stash pile'
    ])
    expect(
      screen.getByRole('button', { name: 'Variant · phone_side' }).getAttribute('aria-current')
    ).toBe('step')
  })

  it('takes the screen’s own head and steps', () => {
    render(<PileRail pile="PILE 2 OF 3 · REVIEW" title="Mug" steps={<button>one</button>} />)
    expect(screen.getByText('PILE 2 OF 3 · REVIEW')).not.toBeNull()
    expect(screen.getByText('Mug')).not.toBeNull()
    expect(screen.queryByText('Top · phone_front')).toBeNull()
  })

  it('is a recessed well, not a card', () => {
    const { container } = render(<PileRail />)
    expect(container.querySelector('[data-ds="PileRail"]')?.className).toContain('bg-surface-1')
  })
})
