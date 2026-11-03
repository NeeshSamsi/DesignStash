import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Switch, type SwitchProps } from './Switch'
import { SWITCH_CONTRACT } from './Switch.types'

describe('Switch', () => {
  it.each(variantMatrix(SWITCH_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Switch {...(props as SwitchProps)} />)
    expect(baseElement.querySelector('[data-ds="Switch"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Switch />)
    for (const text of Object.values<string>(SWITCH_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
