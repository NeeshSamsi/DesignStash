import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { StepBar, type StepBarProps } from './StepBar'
import { STEP_BAR_CONTRACT } from './StepBar.types'

describe('StepBar', () => {
  it.each(variantMatrix(STEP_BAR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<StepBar {...(props as StepBarProps)} />)
    expect(baseElement.querySelector('[data-ds="StepBar"]')).not.toBeNull()
  })

  it('fills the first `value` of five 12×4 steps in the primary colour', () => {
    render(<StepBar value="3" role="img" aria-label="quality 3 of 5" />)
    const bar = screen.getByRole('img', { name: 'quality 3 of 5' })
    const steps = [...bar.children]
    expect(steps).toHaveLength(5)
    expect(steps.map((s) => s.className.includes('bg-primary'))).toEqual([
      true,
      true,
      true,
      false,
      false
    ])
    expect(steps[4]!.className).toContain('bg-surface-3')
    expect(steps[0]!.className).toContain('h-1 w-3 rounded-xs')
  })
})
