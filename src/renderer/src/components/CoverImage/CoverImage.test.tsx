import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CoverImage, type CoverImageProps } from './CoverImage'
import { COVER_IMAGE_CONTRACT } from './CoverImage.types'

describe('CoverImage', () => {
  it.each(variantMatrix(COVER_IMAGE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CoverImage {...(props as CoverImageProps)} />)
    expect(baseElement.querySelector('[data-ds="CoverImage"]')).not.toBeNull()
  })

  it('renders the cover file when there is one, and a placeholder when there is not', () => {
    const { rerender, container } = render(<CoverImage src="file:///cover.png" alt="Mug" />)
    expect(screen.getByRole('img', { name: 'Mug' }).getAttribute('src')).toBe('file:///cover.png')
    rerender(<CoverImage />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows its message at md and lg, and only the icon at xs and sm', () => {
    const { rerender } = render(<CoverImage size="md" state="no-preview" />)
    expect(screen.getByText('No preview')).not.toBeNull()
    rerender(<CoverImage size="sm" state="no-preview" />)
    expect(screen.queryByText('No preview')).toBeNull()
    rerender(<CoverImage size="lg" state="missing-file" />)
    expect(screen.getByText('Cover file missing')).not.toBeNull()
  })

  it('offers Replace cover on a large missing cover only', () => {
    const onReplace = vi.fn()
    const { rerender } = render(<CoverImage size="lg" state="missing-file" onReplace={onReplace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Replace cover' }))
    expect(onReplace).toHaveBeenCalledOnce()
    rerender(<CoverImage size="md" state="missing-file" onReplace={onReplace} />)
    expect(screen.queryByRole('button', { name: 'Replace cover' })).toBeNull()
  })

  it('is a plain block while loading, with no spinner or text', () => {
    const { container } = render(<CoverImage state="loading" />)
    expect(container.querySelector('[data-ds="CoverImage"]')?.childElementCount).toBe(0)
  })

  it.each(variantMatrix(COVER_IMAGE_CONTRACT))(
    'has no squircle clip-path in %s',
    (_label, props) => {
      const { container } = render(<CoverImage {...(props as CoverImageProps)} />)
      const cover = container.querySelector('[data-ds="CoverImage"]')!
      expect(cover.className).not.toMatch(/squircle|clip-path/)
      expect(cover.className).toMatch(/rounded-/)
    }
  )
})
