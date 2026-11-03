import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SectionHeader, type SectionHeaderProps } from './SectionHeader'
import { SECTION_HEADER_CONTRACT } from './SectionHeader.types'

describe('SectionHeader', () => {
  it.each(variantMatrix(SECTION_HEADER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SectionHeader {...(props as SectionHeaderProps)} />)
    expect(baseElement.querySelector('[data-ds="SectionHeader"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<SectionHeader />)
    for (const text of Object.values<string>(SECTION_HEADER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('shows the count only when it has a value', () => {
    const { rerender } = render(<SectionHeader />)
    expect(screen.queryByText('14')).toBeNull()
    rerender(<SectionHeader countValue={14} />)
    expect(screen.getByText('14')).toBeTruthy()
    rerender(<SectionHeader count={false} countValue={14} />)
    expect(screen.queryByText('14')).toBeNull()
  })

  it('renders bulk actions only when on and given', () => {
    const onAll = vi.fn()
    const actions = <button onClick={onAll}>Add all</button>
    const { rerender } = render(<SectionHeader actionsContent={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add all' }))
    expect(onAll).toHaveBeenCalledTimes(1)
    rerender(<SectionHeader actions={false} actionsContent={actions} />)
    expect(screen.queryByRole('button', { name: 'Add all' })).toBeNull()
    rerender(<SectionHeader />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sticky pins to the top; static does not', () => {
    const { container, rerender } = render(<SectionHeader variant="sticky" />)
    expect(container.firstElementChild!.className).toContain('sticky')
    rerender(<SectionHeader variant="static" />)
    expect(container.firstElementChild!.className).not.toContain('sticky')
  })

  it('is a heading', () => {
    render(<SectionHeader title="Strays" />)
    expect(screen.getByRole('heading', { name: 'Strays' })).toBeTruthy()
  })
})
