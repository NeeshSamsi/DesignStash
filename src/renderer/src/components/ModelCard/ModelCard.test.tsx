import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ModelCard, type ModelCardProps } from './ModelCard'
import { MODEL_CARD_CONTRACT } from './ModelCard.types'

describe('ModelCard', () => {
  it.each(variantMatrix(MODEL_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ModelCard {...(props as ModelCardProps)} />)
    expect(baseElement.querySelector('[data-ds="ModelCard"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ModelCard />)
    for (const text of Object.values<string>(MODEL_CARD_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
