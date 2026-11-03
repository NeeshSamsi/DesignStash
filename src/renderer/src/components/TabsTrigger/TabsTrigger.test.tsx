import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TabsTrigger, type TabsTriggerProps } from './TabsTrigger'
import { TABS_TRIGGER_CONTRACT } from './TabsTrigger.types'

describe('TabsTrigger', () => {
  it.each(variantMatrix(TABS_TRIGGER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TabsTrigger {...(props as TabsTriggerProps)} />)
    expect(baseElement.querySelector('[data-ds="TabsTrigger"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<TabsTrigger />)
    for (const text of Object.values<string>(TABS_TRIGGER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
