import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Popover, type PopoverProps } from './Popover'
import { POPOVER_CONTRACT } from './Popover.types'

describe('Popover', () => {
  it.each(variantMatrix(POPOVER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Popover {...(props as PopoverProps)} />)
    expect(baseElement.querySelector('[data-ds="Popover"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Popover />)
    for (const text of Object.values<string>(POPOVER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
