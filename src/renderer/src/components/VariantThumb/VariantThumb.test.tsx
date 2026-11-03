import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { VariantThumb, type VariantThumbProps } from './VariantThumb'
import { VARIANT_THUMB_CONTRACT } from './VariantThumb.types'

describe('VariantThumb', () => {
  it.each(variantMatrix(VARIANT_THUMB_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<VariantThumb {...(props as VariantThumbProps)} />)
    expect(baseElement.querySelector('[data-ds="VariantThumb"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<VariantThumb />)
    for (const text of Object.values<string>(VARIANT_THUMB_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('marks the shown variant with the selected ring and aria-current', () => {
    const { container, rerender } = render(<VariantThumb />)
    const thumb = container.querySelector('[data-ds="VariantThumb"]')!
    expect(thumb.getAttribute('aria-current')).toBeNull()
    rerender(<VariantThumb state="shown" />)
    expect(thumb.getAttribute('aria-current')).toBe('true')
    expect(thumb.querySelector('.border-primary.border-2')).not.toBeNull()
  })

  it('shows the Top mark only on the top mockup', () => {
    const { container, rerender } = render(<VariantThumb label="front" />)
    expect(container.querySelector('[data-top-mark]')).toBeNull()
    rerender(<VariantThumb label="front" top />)
    expect(container.querySelector('[data-top-mark]')).not.toBeNull()
  })

  it('shows a dashed missing-file cover when the cover is gone', () => {
    const { container } = render(<VariantThumb state="missing-cover" />)
    expect(container.querySelector('[data-ds="CoverImage"]')?.getAttribute('data-state')).toBe(
      'missing-file'
    )
  })

  it('renders the variant cover and is clickable', () => {
    const onClick = vi.fn()
    const { container } = render(<VariantThumb coverSrc="file:///side.png" onClick={onClick} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('file:///side.png')
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
