import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PileStep, type PileStepProps } from './PileStep'
import { PILE_STEP_CONTRACT } from './PileStep.types'

describe('PileStep', () => {
  it.each(variantMatrix(PILE_STEP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PileStep {...(props as PileStepProps)} />)
    expect(baseElement.querySelector('[data-ds="PileStep"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<PileStep />)
    for (const text of Object.values<string>(PILE_STEP_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
