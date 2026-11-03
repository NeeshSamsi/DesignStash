import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { GroupCard, type GroupCardProps } from './GroupCard'
import { GROUP_CARD_CONTRACT } from './GroupCard.types'

const root = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-ds="GroupCard"]')!

describe('GroupCard', () => {
  it.each(variantMatrix(GROUP_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<GroupCard {...(props as GroupCardProps)} />)
    expect(baseElement.querySelector('[data-ds="GroupCard"]')).not.toBeNull()
  })

  it('renders the Figma default text with a folder-titled header and the mockup count', () => {
    const { container } = render(<GroupCard />)
    expect(screen.getByText('iPhone 15 Clay')).not.toBeNull()
    expect(screen.getByText('4 mockups')).not.toBeNull()
    expect(container.querySelector('[data-handle] svg')).not.toBeNull()
    expect(screen.getAllByText('Top')).toHaveLength(1)
  })

  it('counts one mockup in the singular and shows no confidence badge', () => {
    render(<GroupCard count={1} />)
    expect(screen.getByText('1 mockup')).not.toBeNull()
    expect(screen.queryByText(/confiden/i)).toBeNull()
  })

  it('shows the reason only when asked, and hides the folder when the title is not a folder', () => {
    const { container, rerender } = render(<GroupCard showFolder={false} />)
    expect(screen.queryByText('similar names')).toBeNull()
    expect(container.querySelector('[data-handle] svg')).toBeNull()
    rerender(<GroupCard showReason reason="top mockup stashed" />)
    expect(screen.getByText('top mockup stashed')).not.toBeNull()
  })

  it('lays the members out by the pile’s own width with container queries', () => {
    const { container } = render(<GroupCard />)
    expect(root(container).className).toContain('@container/pile')
    expect(container.querySelector('.grid-cols-2.\\@md\\/pile\\:grid-cols-3')).not.toBeNull()
  })

  it('takes the board’s tiles as members', () => {
    render(<GroupCard members={<div>my tile</div>} />)
    expect(screen.getByText('my tile')).not.toBeNull()
    expect(screen.queryAllByText('phone_front.psd')).toHaveLength(0)
  })

  it('selected: primary ring and header; merge-target hints Merge into this pile', () => {
    const { container, rerender } = render(<GroupCard state="selected" />)
    expect(root(container).className).toContain('border-primary')
    expect(root(container).getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-handle]')?.className).toContain('bg-primary')
    rerender(<GroupCard state="merge-target" />)
    expect(screen.getByText('Merge into this pile')).not.toBeNull()
    expect(screen.queryByText('4 mockups')).toBeNull()
  })

  it('left-behind is a dashed ghost with an invisible header', () => {
    const { container } = render(<GroupCard state="left-behind" />)
    expect(root(container).className).toContain('border-dashed')
    expect(container.querySelector('[data-handle]')?.className).toContain('opacity-0')
  })

  it('opens the ⋯ menu from its button', () => {
    const onMore = vi.fn()
    render(<GroupCard onMore={onMore} title="Mugs" />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Mugs' }))
    expect(onMore).toHaveBeenCalledOnce()
  })

  it('standalone: "On its own" with its tally, and an empty tray when nothing is left', () => {
    const { container, rerender } = render(<GroupCard variant="standalone" />)
    expect(screen.getByText('On its own')).not.toBeNull()
    expect(screen.getByText('3')).not.toBeNull()
    expect(container.querySelector('[data-handle]')).toBeNull()
    rerender(<GroupCard variant="standalone" state="empty" />)
    expect(screen.getByText('0')).not.toBeNull()
    expect(container.querySelector('[data-ds="GroupMemberThumb"]')).toBeNull()
  })
})
