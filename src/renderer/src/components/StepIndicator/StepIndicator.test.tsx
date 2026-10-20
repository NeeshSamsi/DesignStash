import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { StepIndicator, type StepIndicatorProps } from './StepIndicator'
import { STEP_INDICATOR_CONTRACT } from './StepIndicator.types'

describe('StepIndicator', () => {
  it.each(variantMatrix(STEP_INDICATOR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<StepIndicator {...(props as StepIndicatorProps)} />)
    expect(baseElement.querySelector('[data-ds="StepIndicator"]')).not.toBeNull()
  })
})

describe('StepIndicator marks', () => {
  it('marks earlier steps complete, the step current and the rest upcoming', () => {
    const { container } = render(<StepIndicator step="3" />)
    const status = [...container.querySelectorAll('[data-status]')].map((el) =>
      el.getAttribute('data-status')
    )
    expect(status).toEqual(['complete', 'complete', 'current', 'upcoming', 'upcoming'])
  })

  it('reports the step to assistive tech', () => {
    render(<StepIndicator step="4" variant="dots" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Step 4 of 5')
  })
})
