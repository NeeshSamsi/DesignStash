import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { HardwareSummary, type HardwareSummaryProps } from './HardwareSummary'
import { HARDWARE_SUMMARY_CONTRACT } from './HardwareSummary.types'

describe('HardwareSummary', () => {
  it.each(variantMatrix(HARDWARE_SUMMARY_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<HardwareSummary {...(props as HardwareSummaryProps)} />)
    expect(baseElement.querySelector('[data-ds="HardwareSummary"]')).not.toBeNull()
  })

  it('says this Mac can run on-device AI, with the success badge', () => {
    const { container } = render(<HardwareSummary />)
    expect(screen.getByText('Apple M2 Pro · 32 GB memory')).not.toBeNull()
    expect(screen.getByText('Apple Silicon')).not.toBeNull()
    expect(container.querySelector('[data-ds="HardwareSummary"]')?.className).toContain(
      'border-subtle'
    )
    expect(container.querySelector('.bg-success-weak')).not.toBeNull()
  })

  it('warns on Intel: not supported, and what still works', () => {
    const { container } = render(<HardwareSummary variant="unsupported" />)
    expect(screen.getByText('Not supported')).not.toBeNull()
    expect(screen.getByText(/titles come from file names/)).not.toBeNull()
    expect(container.querySelector('[data-ds="HardwareSummary"]')?.className).toContain(
      'border-warning'
    )
  })

  it('warns on low disk with a drive icon and a way forward', () => {
    render(<HardwareSummary variant="low-disk" />)
    expect(screen.getByText('Low disk')).not.toBeNull()
    expect(screen.getByText(/Free up some space or try a smaller model/)).not.toBeNull()
  })

  it('shows the real machine when it is given', () => {
    render(
      <HardwareSummary
        title="Apple M3 · 24 GB memory"
        description="Fits large models."
        badge="Apple Silicon"
      />
    )
    expect(screen.getByText('Apple M3 · 24 GB memory')).not.toBeNull()
    expect(screen.getByText('Fits large models.')).not.toBeNull()
    expect(screen.queryByText('Apple M2 Pro · 32 GB memory')).toBeNull()
  })
})
