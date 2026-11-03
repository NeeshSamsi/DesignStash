import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ListRow, type ListRowProps } from './ListRow'
import { LIST_ROW_CONTRACT } from './ListRow.types'

describe('ListRow', () => {
  it.each(variantMatrix(LIST_ROW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ListRow {...(props as ListRowProps)} />)
    expect(baseElement.querySelector('[data-ds="ListRow"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ListRow />)
    for (const text of Object.values<string>(LIST_ROW_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('shows the title and the real value line', () => {
    render(<ListRow title="Stash folder" subtitle="128 mockups · 14.2 GB" />)
    expect(screen.getByText('Stash folder')).toBeTruthy()
    expect(screen.getByText('128 mockups · 14.2 GB')).toBeTruthy()
  })

  it('default actions are the standard secondary button, plus ⋯ when wired', () => {
    const onAction = vi.fn()
    const onMore = vi.fn()
    render(<ListRow actionLabel="Restore" onAction={onAction} onMore={onMore} />)
    const restore = screen.getByRole('button', { name: 'Restore' })
    expect(restore.getAttribute('data-variant')).toBe('secondary')
    fireEvent.click(restore)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('actionsContent replaces the defaults (Settings rows put their control here)', () => {
    render(<ListRow actionsContent={<button>Change…</button>} />)
    expect(screen.getByRole('button', { name: 'Change…' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })

  it('titleAdornment sits on the title line', () => {
    render(<ListRow title="Stash check" titleAdornment={<span>In sync</span>} />)
    const title = screen.getByText('Stash check')
    expect(title.parentElement!.textContent).toContain('In sync')
  })

  it('busy swaps the actions for a spinner and flags aria-busy', () => {
    const { container } = render(<ListRow state="busy" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
    expect(container.firstElementChild!.getAttribute('aria-busy')).toBe('true')
  })

  it('error turns the subtitle and border red; selected uses the selected border', () => {
    const { container, rerender } = render(
      <ListRow state="error" subtitle="Couldn’t read this file" />
    )
    expect(screen.getByText('Couldn’t read this file').className).toContain('text-error')
    expect(container.firstElementChild!.className).toContain('border-error')
    rerender(<ListRow state="selected" />)
    expect(container.firstElementChild!.className).toContain('border-selected')
  })

  it('media and thumb are separate slots; thumbContent fills the thumb', () => {
    const { container, rerender } = render(
      <ListRow media={false} thumb thumbContent={<img alt="cover" />} />
    )
    expect(screen.getByAltText('cover')).toBeTruthy()
    expect(container.querySelectorAll('svg').length).toBe(0)
    rerender(<ListRow media thumb={false} />)
    expect(container.querySelectorAll('svg').length).toBe(1)
  })

  it('compact is smaller than regular', () => {
    const { container, rerender } = render(<ListRow density="regular" />)
    expect(container.firstElementChild!.className).toContain('py-2.5')
    rerender(<ListRow density="compact" />)
    expect(container.firstElementChild!.className).toContain('py-1.5')
  })

  it('has at most one filled button', () => {
    const { container } = render(<ListRow onMore={() => {}} />)
    const filled = [...container.querySelectorAll('[data-slot="button"]')].filter((b) =>
      ['default', 'destructive'].includes(b.getAttribute('data-variant') ?? '')
    )
    expect(filled).toHaveLength(0)
  })
})
