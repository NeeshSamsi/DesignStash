import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Select, type SelectProps } from './Select'
import { SELECT_CONTRACT } from './Select.types'

describe('Select', () => {
  it.each(variantMatrix(SELECT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Select {...(props as SelectProps)} />)
    expect(baseElement.querySelector('[data-ds="Select"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Select />)
    for (const text of Object.values<string>(SELECT_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
