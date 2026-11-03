import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

describe('SidebarNavItem behaviour', () => {
  it('marks the active row and keeps the same icon size', () => {
    const { baseElement, rerender } = render(<SidebarNavItem />)
    const size = () => baseElement.querySelector('svg')!.getAttribute('class')
    const idle = size()
    expect(screen.getByRole('button').getAttribute('aria-current')).toBeNull()
    rerender(<SidebarNavItem active />)
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('page')
    expect(size()).toBe(idle)
  })

  it('hides the count and icon on request', () => {
    const { baseElement } = render(<SidebarNavItem showCount={false} showIcon={false} />)
    expect(screen.queryByText('12')).toBeNull()
    expect(baseElement.querySelector('svg')).toBeNull()
  })

  it('is clickable', () => {
    const onClick = vi.fn()
    render(<SidebarNavItem onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
