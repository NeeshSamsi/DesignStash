import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Tooltip, type TooltipProps } from './Tooltip'
import { TOOLTIP_CONTRACT } from './Tooltip.types'

describe('Tooltip', () => {
  it.each(variantMatrix(TOOLTIP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Tooltip {...(props as TooltipProps)} />)
    expect(baseElement.querySelector('[data-ds="Tooltip"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Tooltip />)
    for (const text of Object.values<string>(TOOLTIP_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
