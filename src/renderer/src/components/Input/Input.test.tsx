import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Input, type InputProps } from './Input'
import { INPUT_CONTRACT } from './Input.types'

describe('Input', () => {
  it.each(variantMatrix(INPUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Input {...(props as InputProps)} />)
    expect(baseElement.querySelector('[data-ds="Input"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Input />)
    for (const text of Object.values<string>(INPUT_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
