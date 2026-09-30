import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ActionBar, type ActionBarProps } from './ActionBar'
import { ACTION_BAR_CONTRACT } from './ActionBar.types'

describe('ActionBar', () => {
  it.each(variantMatrix(ACTION_BAR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ActionBar {...(props as ActionBarProps)} />)
    expect(baseElement.querySelector('[data-ds="ActionBar"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ActionBar />)
    for (const text of Object.values<string>(ACTION_BAR_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
