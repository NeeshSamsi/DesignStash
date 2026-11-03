import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Tabs, type TabsProps } from './Tabs'
import { TABS_CONTRACT } from './Tabs.types'

describe('Tabs', () => {
  it.each(variantMatrix(TABS_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Tabs {...(props as TabsProps)} />)
    expect(baseElement.querySelector('[data-ds="Tabs"]')).not.toBeNull()
  })
})
