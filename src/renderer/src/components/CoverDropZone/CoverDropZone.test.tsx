import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { COVER_MAX_BYTES } from '@shared/cover-fit'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CoverDropZone, type CoverDropZoneProps } from './CoverDropZone'
import { COVER_DROP_ZONE_CONTRACT } from './CoverDropZone.types'

const png = () => new File(['x'], 'a.png', { type: 'image/png' })
const drag = (...files: File[]) => ({
  types: ['Files'],
  items: files.map((file) => ({ kind: 'file', type: file.type })),
  files
})
const zone = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-ds="CoverDropZone"]')!

afterEach(() => vi.restoreAllMocks())

describe('CoverDropZone', () => {
  it.each(variantMatrix(COVER_DROP_ZONE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CoverDropZone {...(props as CoverDropZoneProps)} />)
    expect(baseElement.querySelector('[data-ds="CoverDropZone"]')).not.toBeNull()
  })

  it('says a cover is required and what it takes', () => {
    render(<CoverDropZone />)
    expect(screen.getByText('Add a cover to stash it')).not.toBeNull()
    expect(screen.getByText('Drop an image here or click to upload')).not.toBeNull()
    expect(screen.getByText('PNG, JPG or WebP')).not.toBeNull()
  })

  it('opens the file picker on click, Enter and Space', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { container } = render(<CoverDropZone />)
    fireEvent.click(zone(container))
    fireEvent.keyDown(zone(container), { key: 'Enter' })
    fireEvent.keyDown(zone(container), { key: ' ' })
    expect(click).toHaveBeenCalledTimes(3)
  })

  it('shows the shared DropOverlay on drag-over, and the rejected one for non-images', () => {
    const { container } = render(<CoverDropZone />)
    fireEvent.dragEnter(zone(container), { dataTransfer: drag(png()) })
    expect(container.querySelector('[data-ds="DropOverlay"]')?.getAttribute('data-state')).toBe(
      'drag-over'
    )
    expect(screen.getByText('Drop to add a cover')).not.toBeNull()
    fireEvent.dragLeave(zone(container))
    fireEvent.dragEnter(zone(container), {
      dataTransfer: drag(new File(['x'], 'a.pdf', { type: 'application/pdf' }))
    })
    expect(container.querySelector('[data-ds="DropOverlay"]')?.getAttribute('data-state')).toBe(
      'rejected'
    )
  })

  it('takes a dropped image and reports it', () => {
    const onCover = vi.fn()
    const { container } = render(<CoverDropZone onCover={onCover} />)
    const file = png()
    fireEvent.drop(zone(container), { dataTransfer: drag(file) })
    expect(onCover).toHaveBeenCalledWith(file)
  })

  it('shows the error inside the zone for an image over 25 MB', () => {
    const onCover = vi.fn()
    const { container } = render(<CoverDropZone onCover={onCover} />)
    const file = png()
    Object.defineProperty(file, 'size', { value: COVER_MAX_BYTES + 1 })
    fireEvent.drop(zone(container), { dataTransfer: drag(file) })
    expect(onCover).not.toHaveBeenCalled()
    expect(zone(container).getAttribute('data-state')).toBe('error')
    expect(screen.getByText('We couldn’t read that file. Try another image?')).not.toBeNull()
  })

  it('shows upload progress and is not interactive while uploading', () => {
    const { container } = render(<CoverDropZone state="uploading" percent={40} />)
    expect(screen.getByText('Uploading cover…')).not.toBeNull()
    expect(container.querySelector('[data-ds="Progress"]')).not.toBeNull()
    expect(zone(container).getAttribute('aria-busy')).toBe('true')
  })
})
