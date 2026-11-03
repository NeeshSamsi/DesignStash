import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CenteredLayout, type CenteredLayoutProps } from './CenteredLayout'
import { CENTERED_LAYOUT_CONTRACT } from './CenteredLayout.types'

describe('CenteredLayout', () => {
  it.each(variantMatrix(CENTERED_LAYOUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CenteredLayout {...(props as CenteredLayoutProps)} />)
    expect(baseElement.querySelector('[data-ds="CenteredLayout"]')).not.toBeNull()
  })
})

describe('CenteredLayout behaviour', () => {
  it('renders the content slot and no placeholder', () => {
    const { rerender } = render(<CenteredLayout content={<p>Welcome</p>} />)
    expect(screen.getByText('Welcome')).not.toBeNull()
    rerender(<CenteredLayout />)
    expect(screen.queryByText('Swap in content')).toBeNull()
  })
})
