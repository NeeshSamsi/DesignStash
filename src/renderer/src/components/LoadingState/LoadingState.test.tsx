import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { LoadingState, type LoadingStateProps } from './LoadingState'
import { LOADING_STATE_CONTRACT } from './LoadingState.types'

describe('LoadingState', () => {
  it.each(variantMatrix(LOADING_STATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<LoadingState {...(props as LoadingStateProps)} />)
    expect(baseElement.querySelector('[data-ds="LoadingState"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<LoadingState />)
    for (const text of Object.values<string>(LOADING_STATE_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('page loads show skeletons, never a spinner', () => {
    for (const variant of ['page', 'skeleton-grid', 'skeleton-list'] as const) {
      const { container, unmount } = render(<LoadingState variant={variant} />)
      expect(container.querySelector('[data-slot="spinner"]')).toBeNull()
      expect(container.querySelectorAll('[data-ds="Skeleton"]').length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('mirrors the layout: cards for the grid, rows for the list', () => {
    const grid = render(<LoadingState variant="skeleton-grid" count={4} />)
    expect(grid.container.querySelectorAll('[data-variant="card"]')).toHaveLength(4)
    grid.unmount()
    const list = render(<LoadingState variant="skeleton-list" count={2} />)
    expect(list.container.querySelectorAll('[data-variant="row"]')).toHaveLength(2)
  })

  it('only the inline variant uses the small spinner', () => {
    const { container } = render(<LoadingState variant="inline" />)
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
  })
})
