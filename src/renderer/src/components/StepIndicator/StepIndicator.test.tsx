import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { StepIndicator, type StepIndicatorProps } from './StepIndicator'
import { STEP_INDICATOR_CONTRACT } from './StepIndicator.types'

describe('StepIndicator', () => {
  it.each(variantMatrix(STEP_INDICATOR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<StepIndicator {...(props as StepIndicatorProps)} />)
    expect(baseElement.querySelector('[data-ds="StepIndicator"]')).not.toBeNull()
  })
})
