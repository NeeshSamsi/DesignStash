import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { COVER_MAX_BYTES } from '@shared/cover-fit'
import { CoverPanel, type CoverPanelProps } from './CoverPanel'

// Behaviour spec for the cover panel — see design/specs/cover.md.

const png = (name = 'new.png') => new File(['x'], name, { type: 'image/png' })
const big = () => {
  const file = png('huge.png')
  Object.defineProperty(file, 'size', { value: COVER_MAX_BYTES + 1 })
  return file
}
const pdf = () => new File(['x'], 'notes.pdf', { type: 'application/pdf' })

const dragData = (...files: File[]) => ({
  types: ['Files'],
  items: files.map((file) => ({ kind: 'file', type: file.type })),
  files
})

const renderPanel = (props: CoverPanelProps = {}) => {
  const view = render(<CoverPanel coverSrc="file:///old.png" {...props} />)
  const root = view.container.querySelector<HTMLElement>('[data-ds="CoverPanel"]')!
  const cover = view.container.querySelector<HTMLElement>('[aria-label="Cover"]')!
  return { ...view, root, cover }
}
const overlay = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-ds="DropOverlay"]')
const coverImg = (container: HTMLElement) => container.querySelector('img')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CoverPanel · cover image', () => {
  it('says nothing about the PSD’s own preview unless it is low-res', () => {
    const { rerender } = renderPanel({ imageSize: { width: 1600, height: 1200 } })
    expect(screen.queryByText('Low-res preview')).toBeNull()
    rerender(
      <CoverPanel
        source="embedded"
        coverSrc="file:///old.png"
        imageSize={{ width: 640, height: 480 }}
      />
    )
    expect(screen.getByText('Low-res preview')).not.toBeNull()
  })

  it('shows the cover with a tag row: source tag, optional note, and an always-visible Zoom', () => {
    const { container, rerender } = renderPanel({ showNote: true, note: 'Cropped to 4:3' })
    expect(screen.queryByText('Embedded preview')).toBeNull()
    expect(screen.getByText('Cropped to 4:3')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Zoom' })).not.toBeNull()
    expect(coverImg(container)?.getAttribute('src')).toBe('file:///old.png')
    rerender(<CoverPanel source="uploaded" coverSrc="file:///old.png" />)
    expect(screen.getByText('Uploaded')).not.toBeNull()
    expect(screen.queryByText('Cropped to 4:3')).toBeNull()
  })

  it('reveals Replace on hover, plus "Use the PSD’s preview" only on an uploaded cover', () => {
    const { rerender } = renderPanel()
    expect(screen.getByRole('button', { name: 'Replace' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Use the PSD’s preview' })).toBeNull()
    rerender(<CoverPanel source="uploaded" />)
    expect(screen.getByRole('button', { name: 'Use the PSD’s preview' })).not.toBeNull()
    // A sidecar stands in for a PSD preview that is missing or only the kit's notice: main refuses it.
    rerender(<CoverPanel source="sidecar" />)
    expect(screen.getByRole('button', { name: 'Replace' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Use the PSD’s preview' })).toBeNull()
  })

  it('uses the PSD’s preview instantly from its button', () => {
    const onUsePsdPreview = vi.fn()
    renderPanel({ source: 'uploaded', onUsePsdPreview })
    fireEvent.click(screen.getByRole('button', { name: 'Use the PSD’s preview' }))
    expect(onUsePsdPreview).toHaveBeenCalledOnce()
  })

  it('opens the Lightbox from Zoom or Space', () => {
    const onZoom = vi.fn()
    const { cover } = renderPanel({ onZoom })
    fireEvent.click(screen.getByRole('button', { name: 'Zoom' }))
    expect(onZoom).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(cover, { key: ' ' })
    expect(onZoom).toHaveBeenCalledTimes(2)
  })

  it('opens the file picker from Replace and keeps the current cover until a new one is chosen', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const onCover = vi.fn()
    const { container } = renderPanel({ onCover })
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(click).toHaveBeenCalledOnce()
    expect(onCover).not.toHaveBeenCalled()
    expect(coverImg(container)?.getAttribute('src')).toBe('file:///old.png')

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toBe('image/png,image/jpeg,image/webp')
    const file = png()
    fireEvent.change(input, { target: { files: [file] } })
    expect(onCover).toHaveBeenCalledWith(file)
    // The panel only swaps the image when its parent passes the new coverSrc.
    expect(coverImg(container)?.getAttribute('src')).toBe('file:///old.png')
  })

  it('shows the shared DropOverlay when an image is dragged over the cover', () => {
    const { root, container } = renderPanel()
    expect(overlay(container)).toBeNull()
    fireEvent.dragEnter(root, { dataTransfer: dragData(png()) })
    expect(overlay(container)?.getAttribute('data-state')).toBe('drag-over')
    expect(screen.getByText('Drop to use as cover')).not.toBeNull()
    // The cover is too small for the window-wide display size.
    expect(screen.getByText('Drop to use as cover').className).toContain('type-title-lg-semibold')
    fireEvent.dragLeave(root)
    expect(overlay(container)).toBeNull()
  })

  it('rejects non-images while dragging, with the DropOverlay rejected state', () => {
    const { root, container } = renderPanel()
    fireEvent.dragEnter(root, { dataTransfer: dragData(pdf()) })
    expect(overlay(container)?.getAttribute('data-state')).toBe('rejected')
    expect(screen.getByText('That’s not an image')).not.toBeNull()
    expect(screen.getByText('Covers can be PNG, JPG or WebP, up to 25 MB')).not.toBeNull()
  })

  it('uses the first image when several files are dropped and says so', () => {
    const onCover = vi.fn()
    const { root, container } = renderPanel({ onCover })
    const files = [png('a.png'), png('b.png'), png('c.png')]
    fireEvent.drop(root, { dataTransfer: dragData(...files) })
    expect(onCover).toHaveBeenCalledOnce()
    expect(onCover).toHaveBeenCalledWith(files[0])
    expect(screen.getByText('We’ll use the first image (3 files)')).not.toBeNull()
    expect(overlay(container)).toBeNull()
  })

  it('accepts a pasted image (⌘V) like a drop', () => {
    const onCover = vi.fn()
    renderPanel({ onCover })
    const file = png('pasted.png')
    fireEvent.paste(document, { clipboardData: { files: [file] } })
    expect(onCover).toHaveBeenCalledWith(file)
  })

  it('leaves a paste alone when it is aimed at a text field or carries no image', () => {
    const onCover = vi.fn()
    renderPanel({ onCover })
    const input = document.body.appendChild(document.createElement('input'))
    fireEvent.paste(input, { clipboardData: { files: [png()] } })
    fireEvent.paste(document, { clipboardData: { files: [] } })
    expect(onCover).not.toHaveBeenCalled()
    input.remove()
  })

  it('keeps the old cover dimmed with progress while replacing; Esc cancels', () => {
    const onCancelReplace = vi.fn()
    const { container } = renderPanel({ state: 'replacing', percent: 40, onCancelReplace })
    expect(screen.getByText('Replacing cover…')).not.toBeNull()
    expect(container.querySelector('[data-ds="Progress"]')).not.toBeNull()
    expect(coverImg(container)?.getAttribute('src')).toBe('file:///old.png')
    expect(container.querySelector('[data-ds="CoverImage"]')?.className).toContain('opacity-40')
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancelReplace).toHaveBeenCalledOnce()
  })

  it('keeps the cover and shows an error Banner for unreadable files or files over 25 MB', () => {
    const onCover = vi.fn()
    const { root, container, rerender } = renderPanel({ onCover })
    fireEvent.drop(root, { dataTransfer: dragData(big()) })
    expect(onCover).not.toHaveBeenCalled()
    expect(coverImg(container)?.getAttribute('src')).toBe('file:///old.png')
    const banner = container.querySelector('[data-ds="Banner"]')!
    expect(banner.getAttribute('data-tone')).toBe('error')
    expect(screen.getByText('We couldn’t use that image')).not.toBeNull()
    expect(
      screen.getByText(
        'Your cover hasn’t changed. Try another file (PNG, JPG or WebP, up to 25 MB).'
      )
    ).not.toBeNull()

    // Unreadable files are reported by the parent.
    rerender(<CoverPanel coverSrc="file:///old.png" state="error" />)
    expect(screen.getByText('We couldn’t use that image')).not.toBeNull()
  })

  it('clears the error when the next file is good', () => {
    const { root } = renderPanel({ onCover: vi.fn() })
    fireEvent.drop(root, { dataTransfer: dragData(big()) })
    expect(screen.queryByText('We couldn’t use that image')).not.toBeNull()
    fireEvent.drop(root, { dataTransfer: dragData(png()) })
    expect(screen.queryByText('We couldn’t use that image')).toBeNull()
  })

  it('crops to 4:3 when at least 75% of the image survives, with the note "Cropped to 4:3"', () => {
    const { cover } = renderPanel({ imageSize: { width: 1000, height: 1000 } })
    expect(cover.getAttribute('data-fit')).toBe('crop')
    expect(screen.getByText('Cropped to 4:3')).not.toBeNull()
  })

  it('shows the whole image with bars when a crop would lose more than 25%', () => {
    const { cover, container } = renderPanel({ imageSize: { width: 1080, height: 1920 } })
    expect(cover.getAttribute('data-fit')).toBe('bars')
    expect(screen.getByText('Shown whole · much taller than 4:3')).not.toBeNull()
    expect(coverImg(container)?.className).toContain('object-contain')
    expect(cover.className).toContain('bg-surface-1')
  })

  it('derives bars and the note from the image, not from the props', () => {
    const { cover } = renderPanel({
      bars: true,
      showNote: true,
      note: 'ignored',
      imageSize: { width: 1600, height: 1200 }
    })
    expect(cover.getAttribute('data-fit')).toBe('crop')
    expect(screen.queryByText('ignored')).toBeNull()
  })

  it('tags a sidecar cover "Sidecar image" and never asks whether to use it', () => {
    const { container } = renderPanel({ source: 'sidecar', coverSrc: 'file:///side.png' })
    expect(container.querySelector('[data-ds="Banner"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use this cover' })).toBeNull()
    expect(screen.getByText('Sidecar image')).not.toBeNull()
  })

  it('shows the required drop zone when there is no cover at all', () => {
    const onCover = vi.fn()
    const { container, root } = renderPanel({ source: 'none', onCover })
    expect(container.querySelector('[data-ds="CoverDropZone"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Zoom' })).toBeNull()
    fireEvent.drop(root.querySelector('[data-ds="CoverDropZone"]')!, {
      dataTransfer: dragData(png())
    })
    expect(onCover).toHaveBeenCalledOnce()
  })

  it('offers Replace cover when the cover file is missing', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    renderPanel({ coverMissing: true })
    fireEvent.click(screen.getByRole('button', { name: 'Replace cover' }))
    expect(click).toHaveBeenCalledOnce()
  })

  it('peeks the deck behind a pile’s cover and counts what is left', () => {
    const { container } = renderPanel({
      showDeck: true,
      deckMore: true,
      deckLabel: '2 left in this pile'
    })
    expect(container.querySelector('[data-deck="1"]')).not.toBeNull()
    expect(container.querySelector('[data-deck="2"]')).not.toBeNull()
    expect(screen.getByText('2 left in this pile')).not.toBeNull()
  })

  it('requires a cover (Stash & next disabled) when there is no embedded preview or sidecar', async () => {
    const single = (id: number) => ({
      mockupId: id,
      pileId: null,
      role: 'single',
      title: `T${id}`,
      description: '',
      tags: [],
      touched: false,
      checked: false,
      cover: { path: '', source: 'none', missing: false, width: null, height: null }
    })
    window.api = {
      appName: 'x',
      invoke: async (channel: string) =>
        channel === 'look-over:open'
          ? {
              success: true,
              data: {
                units: [
                  { unitId: 1, kind: 'single', items: [single(1)] },
                  { unitId: 2, kind: 'single', items: [single(2)] }
                ],
                resume: null
              }
            }
          : { success: true, data: { tree: [] } },
      subscribe: () => () => {},
      getPathForFile: () => ''
    } as unknown as typeof window.api
    const { LookOverFlow } = await import('@renderer/screens/look-over')
    render(<LookOverFlow open onClose={() => {}} />)
    await screen.findByRole('textbox', { name: /Title/ })
    expect(document.querySelector('[data-ds="CoverDropZone"]')).not.toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Stash & next' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})
