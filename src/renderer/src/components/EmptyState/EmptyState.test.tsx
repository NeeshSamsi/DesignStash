import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { EMPTY_STATE_CONTRACT } from './EmptyState.types'

describe('EmptyState', () => {
  it.each(variantMatrix(EMPTY_STATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<EmptyState {...(props as EmptyStateProps)} />)
    expect(baseElement.querySelector('[data-ds="EmptyState"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<EmptyState />)
    for (const text of Object.values<string>(EMPTY_STATE_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
