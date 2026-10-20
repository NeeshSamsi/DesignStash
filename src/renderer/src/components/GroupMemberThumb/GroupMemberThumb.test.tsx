import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { GroupMemberThumb, type GroupMemberThumbProps } from './GroupMemberThumb'
import { GROUP_MEMBER_THUMB_CONTRACT } from './GroupMemberThumb.types'

const root = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-ds="GroupMemberThumb"]')!

describe('GroupMemberThumb', () => {
  it.each(variantMatrix(GROUP_MEMBER_THUMB_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<GroupMemberThumb {...(props as GroupMemberThumbProps)} />)
    expect(baseElement.querySelector('[data-ds="GroupMemberThumb"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<GroupMemberThumb />)
    expect(screen.getByText('phone_front.psd')).not.toBeNull()
  })

  it('says Top, never Primary, on the top mockup', () => {
    render(<GroupMemberThumb primary />)
    expect(screen.getByText('Top')).not.toBeNull()
    expect(screen.queryByText('Primary')).toBeNull()
  })

  it('shows the selection ring and an accent caption when selected', () => {
    const { container } = render(<GroupMemberThumb state="selected" />)
    expect(root(container).className).toContain('border-primary')
    expect(root(container).getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('.bg-primary.text-on-primary')).not.toBeNull()
  })

  it('offers the ⋯ menu on hover (CSS) without changing the selection', () => {
    const onMore = vi.fn()
    const onClick = vi.fn()
    render(<GroupMemberThumb onMore={onMore} onClick={onClick} filename="a.psd" />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for a.psd' }))
    expect(onMore).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('hints Start a pile on a pile target', () => {
    render(<GroupMemberThumb state="pile-target" />)
    expect(screen.getByText('Start a pile')).not.toBeNull()
  })

  it('left-behind and drop-ghost are empty slots, hidden from assistive tech', () => {
    const { container, rerender } = render(<GroupMemberThumb state="left-behind" />)
    expect(root(container).className).toContain('border-dashed')
    expect(root(container).getAttribute('aria-hidden')).toBe('true')
    rerender(<GroupMemberThumb state="drop-ghost" />)
    expect(root(container).className).toContain('bg-primary-weak')
    expect(screen.queryByText('phone_front.psd')).toBeNull()
  })

  it('lifts with a shadow while in hand', () => {
    const { container } = render(<GroupMemberThumb state="lifted" />)
    expect(root(container).className).toContain('shadow-lifted')
  })
})
