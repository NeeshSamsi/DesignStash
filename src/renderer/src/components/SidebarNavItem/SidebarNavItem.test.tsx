import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SidebarNavItem, type SidebarNavItemProps } from './SidebarNavItem'
import { SIDEBAR_NAV_ITEM_CONTRACT } from './SidebarNavItem.types'

describe('SidebarNavItem', () => {
  it.each(variantMatrix(SIDEBAR_NAV_ITEM_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SidebarNavItem {...(props as SidebarNavItemProps)} />)
    expect(baseElement.querySelector('[data-ds="SidebarNavItem"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<SidebarNavItem />)
    for (const text of Object.values<string>(SIDEBAR_NAV_ITEM_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
