import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { StepperHeader, type StepperHeaderProps } from './StepperHeader'
import { STEPPER_HEADER_CONTRACT } from './StepperHeader.types'

describe('StepperHeader', () => {
  it.each(variantMatrix(STEPPER_HEADER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<StepperHeader {...(props as StepperHeaderProps)} />)
    expect(baseElement.querySelector('[data-ds="StepperHeader"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<StepperHeader />)
    for (const text of Object.values<string>(STEPPER_HEADER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
