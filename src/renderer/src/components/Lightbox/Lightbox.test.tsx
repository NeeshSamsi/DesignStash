import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Lightbox, type LightboxProps } from './Lightbox'
import { LIGHTBOX_CONTRACT } from './Lightbox.types'

describe('Lightbox', () => {
  it.each(variantMatrix(LIGHTBOX_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Lightbox {...(props as LightboxProps)} />)
    expect(baseElement.querySelector('[data-ds="Lightbox"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Lightbox />)
    for (const text of Object.values<string>(LIGHTBOX_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('shows the cover and names the dialog from the caption', () => {
    render(<Lightbox open caption="Clay iPhone 15 Pro" src="cover.webp" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Clay iPhone 15 Pro' })).toBeTruthy()
    expect((screen.getByAltText('Clay iPhone 15 Pro') as HTMLImageElement).getAttribute('src')).toBe('cover.webp')
  })

  it('Esc closes it', () => {
    const onClose = vi.fn()
    render(<Lightbox open src="a.webp" onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc returns focus to the card it opened from', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>card</button>
          <Lightbox open={open} src="a.webp" onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<Harness />)
    const card = screen.getByRole('button', { name: 'card' })
    card.focus()
    fireEvent.click(card)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(card))
  })

  it('← and → step through the grid, and the arrow buttons do the same', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(<Lightbox open src="a.webp" onClose={vi.fn()} onPrev={onPrev} onNext={onNext} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(onPrev).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onNext).toHaveBeenCalledTimes(3)
    expect(onPrev).toHaveBeenCalledTimes(2)
  })

  it('arrows do nothing at the ends and the buttons are off', () => {
    const onNext = vi.fn()
    render(<Lightbox open src="a.webp" onClose={vi.fn()} onNext={onNext} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows no arrows for a lone mockup', () => {
    render(<Lightbox open src="a.webp" onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('loading is a skeleton block, never a spinner', () => {
    render(<Lightbox open state="loading" onClose={vi.fn()} />)
    expect(document.querySelector('[data-ds="CoverImage"][data-state="loading"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull()
  })

  it('a missing file offers Check library, and Replace cover when wired', () => {
    const onCheckLibrary = vi.fn()
    const onReplace = vi.fn()
    render(
      <Lightbox open state="missing" onClose={vi.fn()} onCheckLibrary={onCheckLibrary} onReplace={onReplace} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace cover' }))
    expect(onCheckLibrary).toHaveBeenCalledTimes(1)
    expect(onReplace).toHaveBeenCalledTimes(1)
  })

  it('zooms: Fit is pressed by default, 100% and ± change it, Fit resets', () => {
    render(<Lightbox open src="a.webp" onClose={vi.fn()} />)
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed')
    expect(pressed('Fit')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    expect([pressed('Fit'), pressed('100%')]).toEqual(['false', 'true'])
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect([pressed('Fit'), pressed('100%')]).toEqual(['false', 'false'])
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(pressed('100%')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect([pressed('Fit'), pressed('100%')]).toEqual(['true', 'false'])
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(pressed('Fit')).toBe('true')
  })

  it('the catalog group mode shows both arrows', () => {
    render(<Lightbox mode="group" />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })

  it('returns focus to returnFocusTo when given, for a preview opened from a menu', async () => {
    const card = document.createElement('button')
    document.body.append(card)
    function Harness() {
      const [open, setOpen] = useState(true)
      return <Lightbox open={open} src="a.webp" returnFocusTo={card} onClose={() => setOpen(false)} />
    }
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(card))
    card.remove()
  })
})
