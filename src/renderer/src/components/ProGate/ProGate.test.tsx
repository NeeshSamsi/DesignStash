import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ProGate, type ProGateProps } from './ProGate'
import { PRO_GATE_CONTRACT } from './ProGate.types'

describe('ProGate', () => {
  it.each(variantMatrix(PRO_GATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ProGate {...(props as ProGateProps)} />)
    expect(baseElement.querySelector('[data-ds="ProGate"]')).not.toBeNull()
  })
})

describe('ProGate behaviour', () => {
  it('locked shows the Pro tag, a line on the feature and Upgrade, and hides the child', () => {
    const onUpgrade = vi.fn()
    render(
      <ProGate onUpgrade={onUpgrade}>
        <p>feature</p>
      </ProGate>
    )
    expect(screen.getByText('Pro')).not.toBeNull()
    expect(screen.getByText('Semantic search is a Pro feature')).not.toBeNull()
    expect(screen.queryByText('feature')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))
    expect(onUpgrade).toHaveBeenCalledOnce()
  })

  it('has no Learn more button', () => {
    render(<ProGate variant="page" />)
    expect(screen.queryByText(/learn more/i)).toBeNull()
  })

  it('unlocked renders the child and nothing else', () => {
    render(
      <ProGate unlocked>
        <p>feature</p>
      </ProGate>
    )
    expect(screen.getByText('feature')).not.toBeNull()
    expect(screen.queryByText('Pro')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull()
  })
})
