import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ErrorState, type ErrorStateProps } from './ErrorState'
import { ERROR_STATE_CONTRACT } from './ErrorState.types'

describe('ErrorState', () => {
  it.each(variantMatrix(ERROR_STATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ErrorState {...(props as ErrorStateProps)} />)
    expect(baseElement.querySelector('[data-ds="ErrorState"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ErrorState />)
    for (const text of Object.values<string>(ERROR_STATE_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
