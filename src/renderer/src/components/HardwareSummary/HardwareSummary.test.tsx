import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { HardwareSummary, type HardwareSummaryProps } from './HardwareSummary'
import { HARDWARE_SUMMARY_CONTRACT } from './HardwareSummary.types'

describe('HardwareSummary', () => {
  it.each(variantMatrix(HARDWARE_SUMMARY_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<HardwareSummary {...(props as HardwareSummaryProps)} />)
    expect(baseElement.querySelector('[data-ds="HardwareSummary"]')).not.toBeNull()
  })
})
