import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { VariantStrip, type StripVariant, type VariantStripProps } from './VariantStrip'
import { VARIANT_STRIP_CONTRACT } from './VariantStrip.types'

const pile = (count: number): StripVariant[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `v${index + 1}`,
    label: `name ${index + 1}`,
    top: index === 0
  }))

const track = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-ds="VariantStrip"] [style*="translateX"]')!
const windowOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-ds="VariantStrip"] > div')!
const thumbs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-ds="VariantThumb"]'))
const arrows = () => ({
  prev: screen.queryByRole('button', { name: 'Previous variant' }),
  next: screen.queryByRole('button', { name: 'Next variant' })
})

/** A strip wired the way a screen wires it: the screen owns which variant is shown. */
function Harness({ count = 12, onShow }: { count?: number; onShow?: (id: string) => void }) {
  const [shownId, setShownId] = useState('v1')
  return (
    <VariantStrip
      variants={pile(count)}
      shownId={shownId}
      onShow={(id) => {
        setShownId(id)
        onShow?.(id)
      }}
    />
  )
}

describe('VariantStrip', () => {
  it.each(variantMatrix(VARIANT_STRIP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<VariantStrip {...(props as VariantStripProps)} />)
    expect(baseElement.querySelector('[data-ds="VariantStrip"]')).not.toBeNull()
  })

  describe('slots and arrows', () => {
    it('fits 2 to 5 variants with no arrows', () => {
      for (const count of [2, 3, 5]) {
        const { unmount } = render(<VariantStrip variants={pile(count)} />)
        expect(arrows()).toEqual({ prev: null, next: null })
        unmount()
      }
    })

    it('shows only › at the start, both when scrolled and only ‹ at the end', () => {
      const { rerender } = render(<VariantStrip overflow="start" />)
      expect(arrows().prev).toBeNull()
      expect(arrows().next).not.toBeNull()
      rerender(<VariantStrip overflow="scrolled" />)
      expect(arrows().prev).not.toBeNull()
      expect(arrows().next).not.toBeNull()
    })

    it('shows only ‹ at the end', () => {
      render(<VariantStrip overflow="end" />)
      expect(arrows().prev).not.toBeNull()
      expect(arrows().next).toBeNull()
    })

    it('puts thumbnails on slots every 92px, matching Figma’s scrolled and end offsets', () => {
      const { container, rerender } = render(<VariantStrip overflow="start" />)
      expect(track(container).style.transform).toBe('translateX(0px)')
      rerender(<VariantStrip overflow="scrolled" />)
      expect(track(container).style.transform).toBe('translateX(-368px)')
      rerender(<VariantStrip overflow="end" />)
      expect(track(container).style.transform).toBe('translateX(-644px)')
    })

    it('draws a fade under each arrow, and none where there is no arrow', () => {
      const { container, rerender } = render(<VariantStrip overflow="start" />)
      expect(container.querySelectorAll('.w-14')).toHaveLength(1)
      rerender(<VariantStrip overflow="scrolled" />)
      expect(container.querySelectorAll('.w-14')).toHaveLength(2)
      rerender(<VariantStrip overflow="fits" />)
      expect(container.querySelectorAll('.w-14')).toHaveLength(0)
    })

    it('marks a missing cover', () => {
      const { container } = render(<VariantStrip missingCover />)
      expect(thumbs(container)[2]?.getAttribute('data-state')).toBe('missing-cover')
    })
  })

  describe('status row', () => {
    it('names the shown variant: name · n of N', () => {
      const { rerender } = render(<VariantStrip overflow="fits" />)
      expect(screen.getByText('front · 1 of 4')).not.toBeNull()
      rerender(<VariantStrip overflow="scrolled" />)
      expect(screen.getByText('¾ left · 7 of 12')).not.toBeNull()
      rerender(<VariantStrip overflow="end" />)
      expect(screen.getByText('close-up · 12 of 12')).not.toBeNull()
    })

    it('reads Top on the top mockup and offers Put on top on any other', () => {
      const onPutOnTop = vi.fn()
      const { rerender } = render(
        <VariantStrip variants={pile(4)} shownId="v1" onPutOnTop={onPutOnTop} />
      )
      expect(screen.getByText('Top')).not.toBeNull()
      expect(screen.queryByRole('button', { name: 'Put on top' })).toBeNull()
      rerender(<VariantStrip variants={pile(4)} shownId="v3" onPutOnTop={onPutOnTop} />)
      expect(screen.queryByText('Top')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Put on top' }))
      expect(onPutOnTop).toHaveBeenCalledWith('v3')
    })

    it('marks the top mockup’s thumbnail with the crown', () => {
      const { container } = render(<VariantStrip variants={pile(4)} />)
      expect(container.querySelectorAll('[data-top-mark]')).toHaveLength(1)
    })
  })

  describe('stepping', () => {
    it('shows a variant when its thumbnail is clicked', () => {
      const onShow = vi.fn()
      const { container } = render(<Harness count={4} onShow={onShow} />)
      fireEvent.click(thumbs(container)[2]!)
      expect(onShow).toHaveBeenCalledWith('v3')
      expect(thumbs(container)[2]?.getAttribute('aria-current')).toBe('true')
    })

    it('steps with ‹ › and ← →, and stops at the ends', () => {
      const onShow = vi.fn()
      const { container } = render(<Harness count={4} onShow={onShow} />)
      fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowLeft' })
      expect(onShow).not.toHaveBeenCalled()
      fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowRight' })
      expect(onShow).toHaveBeenLastCalledWith('v2')
      fireEvent.keyDown(thumbs(container)[1]!, { key: 'ArrowRight' })
      fireEvent.keyDown(thumbs(container)[2]!, { key: 'ArrowRight' })
      fireEvent.keyDown(thumbs(container)[3]!, { key: 'ArrowRight' })
      expect(onShow).toHaveBeenCalledTimes(3)
      expect(onShow).toHaveBeenLastCalledWith('v4')
    })

    it('steps from the arrows on the fades', () => {
      const onShow = vi.fn()
      render(<Harness onShow={onShow} />)
      fireEvent.click(screen.getByRole('button', { name: 'Next variant' }))
      expect(onShow).toHaveBeenLastCalledWith('v2')
    })

    it('never queues: every press moves one variant from where it is now', () => {
      const onShow = vi.fn()
      const { container } = render(<Harness onShow={onShow} />)
      for (let press = 0; press < 3; press += 1) {
        fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowRight' })
      }
      expect(onShow.mock.calls.map(([id]) => id)).toEqual(['v2', 'v3', 'v4'])
    })

    it('keeps the shown variant in a clear slot: stepping onto the faded end scrolls one slot', () => {
      const { container } = render(<Harness />)
      for (let press = 0; press < 3; press += 1) {
        fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowRight' })
      }
      // v4 is the 4th slot: clear, so no scroll yet.
      expect(track(container).style.transform).toBe('translateX(0px)')
      fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowRight' })
      // v5 is the 5th slot, under the fade: scroll exactly one slot.
      expect(track(container).style.transform).toBe('translateX(-92px)')
      fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowRight' })
      expect(track(container).style.transform).toBe('translateX(-184px)')
    })

    it('scrolls a distant variant into a clear slot', () => {
      const { container } = render(<Harness />)
      fireEvent.click(thumbs(container)[9]!)
      // The 10th variant lands in the 4th slot: offset 6.
      expect(track(container).style.transform).toBe('translateX(-552px)')
    })

    it('scrolls back one slot when stepping onto the left fade', () => {
      const { container } = render(<Harness />)
      fireEvent.click(thumbs(container)[11]!)
      expect(track(container).style.transform).toBe('translateX(-644px)')
      fireEvent.click(thumbs(container)[7]!)
      expect(track(container).style.transform).toBe('translateX(-552px)')
      fireEvent.keyDown(thumbs(container)[0]!, { key: 'ArrowLeft' })
      expect(track(container).style.transform).toBe('translateX(-460px)')
    })
  })

  describe('drag and wheel always settle on a slot', () => {
    it('settles a drag on the nearest slot and does not pick a thumbnail', () => {
      const onShow = vi.fn()
      const { container } = render(<Harness onShow={onShow} />)
      const win = windowOf(container)
      fireEvent.pointerDown(win, { clientX: 300, clientY: 10, button: 0, pointerId: 1 })
      fireEvent.pointerMove(win, { clientX: 190, clientY: 10, pointerId: 1 })
      fireEvent.pointerUp(win, { clientX: 190, clientY: 10, pointerId: 1 })
      expect(track(container).style.transform).toBe('translateX(-92px)')
      fireEvent.click(thumbs(container)[3]!)
      expect(onShow).not.toHaveBeenCalled()
    })

    it('treats a short press as a click, not a drag', () => {
      const onShow = vi.fn()
      const { container } = render(<Harness onShow={onShow} />)
      const win = windowOf(container)
      fireEvent.pointerDown(win, { clientX: 300, button: 0, pointerId: 1 })
      fireEvent.pointerUp(win, { clientX: 301, pointerId: 1 })
      fireEvent.click(thumbs(container)[1]!)
      expect(onShow).toHaveBeenCalledWith('v2')
    })

    it('moves one slot per horizontal wheel step', () => {
      const { container } = render(<Harness />)
      fireEvent.wheel(windowOf(container), { deltaX: 80, deltaY: 0 })
      expect(track(container).style.transform).toBe('translateX(-92px)')
      fireEvent.wheel(windowOf(container), { deltaX: -80, deltaY: 0 })
      expect(track(container).style.transform).toBe('translateX(0px)')
    })

    it('does not scroll a strip that fits', () => {
      const { container } = render(<Harness count={4} />)
      fireEvent.wheel(windowOf(container), { deltaX: 200, deltaY: 0 })
      expect(track(container).style.transform).toBe('translateX(0px)')
    })
  })
})
