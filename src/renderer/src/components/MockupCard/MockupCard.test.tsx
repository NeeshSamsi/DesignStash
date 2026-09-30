import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { MockupCard, type MockupCardProps } from './MockupCard'
import { MOCKUP_CARD_CONTRACT } from './MockupCard.types'

describe('MockupCard', () => {
  it.each(variantMatrix(MOCKUP_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<MockupCard {...(props as MockupCardProps)} />)
    expect(baseElement.querySelector('[data-ds="MockupCard"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<MockupCard />)
    for (const text of Object.values<string>(MOCKUP_CARD_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
