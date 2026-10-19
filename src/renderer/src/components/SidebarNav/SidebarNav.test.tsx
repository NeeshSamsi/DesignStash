import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SidebarNav, sidebarNavVariant, type SidebarNavProps } from './SidebarNav'
import { SIDEBAR_NAV_CONTRACT } from './SidebarNav.types'

describe('SidebarNav', () => {
  it.each(variantMatrix(SIDEBAR_NAV_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SidebarNav {...(props as SidebarNavProps)} />)
    expect(baseElement.querySelector('[data-ds="SidebarNav"]')).not.toBeNull()
  })
})

describe('SidebarNav behaviour', () => {
  it('lists To sort and To stash by variant', () => {
    const { rerender } = render(<SidebarNav variant="none" />)
    expect(screen.queryByText('To sort')).toBeNull()
    expect(screen.queryByText('To stash')).toBeNull()
    rerender(<SidebarNav variant="to-sort" />)
    expect(screen.getByText('To sort')).not.toBeNull()
    expect(screen.queryByText('To stash')).toBeNull()
    rerender(<SidebarNav variant="both" />)
    expect(screen.getByText('To sort')).not.toBeNull()
    expect(screen.getByText('To stash')).not.toBeNull()
  })

  it('derives the variant from the counts', () => {
    expect(sidebarNavVariant(0, 0)).toBe('none')
    expect(sidebarNavVariant(2, 0)).toBe('to-sort')
    expect(sidebarNavVariant(0, 3)).toBe('to-stash')
    expect(sidebarNavVariant(2, 3)).toBe('both')
  })

  it('marks the selected page and shows counts', () => {
    render(<SidebarNav selected="starred" counts={{ starred: 12, all: 128, trash: 3 }} />)
    const starred = screen.getByRole('button', { name: /Starred/ })
    expect(starred.getAttribute('aria-current')).toBe('page')
    expect(starred.textContent).toContain('12')
    expect(screen.getByRole('button', { name: /All/ }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('button', { name: /Trash/ }).textContent).toContain('3')
  })

  it('reports navigation', () => {
    const onNavigate = vi.fn()
    render(<SidebarNav variant="both" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: /To stash/ }))
    fireEvent.click(screen.getByRole('button', { name: /My Stash/ }))
    expect(onNavigate.mock.calls).toEqual([['to-stash'], ['all']])
  })

  it('opens Settings through the callback, not a route', () => {
    const onOpenSettings = vi.fn()
    render(<SidebarNav onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
