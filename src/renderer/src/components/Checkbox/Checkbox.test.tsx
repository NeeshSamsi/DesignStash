import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Checkbox, type CheckboxProps } from './Checkbox'
import { CHECKBOX_CONTRACT } from './Checkbox.types'

describe('Checkbox', () => {
  it.each(variantMatrix(CHECKBOX_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Checkbox {...(props as CheckboxProps)} />)
    expect(baseElement.querySelector('[data-ds="Checkbox"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Checkbox />)
    for (const text of Object.values<string>(CHECKBOX_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
