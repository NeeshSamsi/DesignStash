import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SidebarNav, type SidebarNavProps } from './SidebarNav'
import { SIDEBAR_NAV_CONTRACT } from './SidebarNav.types'

describe('SidebarNav', () => {
  it.each(variantMatrix(SIDEBAR_NAV_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SidebarNav {...(props as SidebarNavProps)} />)
    expect(baseElement.querySelector('[data-ds="SidebarNav"]')).not.toBeNull()
  })
})
