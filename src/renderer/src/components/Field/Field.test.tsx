import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Field, type FieldProps } from './Field'
import { FIELD_CONTRACT } from './Field.types'

describe('Field', () => {
  it.each(variantMatrix(FIELD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Field {...(props as FieldProps)} />)
    expect(baseElement.querySelector('[data-ds="Field"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Field />)
    for (const text of Object.values<string>(FIELD_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
