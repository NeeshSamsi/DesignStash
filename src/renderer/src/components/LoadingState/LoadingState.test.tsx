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
})
