import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { RadioGroup, type RadioGroupProps } from './RadioGroup'
import { RADIO_GROUP_CONTRACT } from './RadioGroup.types'

describe('RadioGroup', () => {
  it.each(variantMatrix(RADIO_GROUP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<RadioGroup {...(props as RadioGroupProps)} />)
    expect(baseElement.querySelector('[data-ds="RadioGroup"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<RadioGroup />)
    for (const text of Object.values<string>(RADIO_GROUP_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
