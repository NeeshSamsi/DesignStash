import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { OnboardingStep, type OnboardingStepProps } from './OnboardingStep'
import { ONBOARDING_STEP_CONTRACT } from './OnboardingStep.types'

describe('OnboardingStep', () => {
  it.each(variantMatrix(ONBOARDING_STEP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<OnboardingStep {...(props as OnboardingStepProps)} />)
    expect(baseElement.querySelector('[data-ds="OnboardingStep"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<OnboardingStep />)
    for (const text of Object.values<string>(ONBOARDING_STEP_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
