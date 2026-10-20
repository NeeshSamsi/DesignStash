import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

describe('OnboardingStep behaviour', () => {
  it('welcome has a single Get started button', () => {
    const onPrimary = vi.fn()
    render(<OnboardingStep onPrimary={onPrimary} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(onPrimary).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('standard shows Back, skip and Continue, with one filled button', () => {
    const onBack = vi.fn()
    const onSkip = vi.fn()
    render(<OnboardingStep variant="standard" onBack={onBack} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onSkip).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeNull()
  })

  it('busy swaps the primary label and disables it', () => {
    render(<OnboardingStep variant="standard" busy busyLabel="Checking…" />)
    const button = screen.getByRole('button', { name: /Checking…/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('renders the content slot on standard only', () => {
    const { rerender } = render(<OnboardingStep variant="standard" content={<p>models</p>} />)
    expect(screen.getByText('models')).not.toBeNull()
    rerender(<OnboardingStep variant="welcome" content={<p>models</p>} />)
    expect(screen.queryByText('models')).toBeNull()
  })
})
