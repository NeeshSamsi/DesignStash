import { EASE_IN, EASE_OUT } from '@renderer/design-system/motion'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CoverPanel } from './CoverPanel'

// The deck motion on a variant switch: design/specs/detail.md, D1.4.

interface Call {
  element: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancel: ReturnType<typeof vi.fn>
}

let calls: Call[] = []

function stubAnimate() {
  calls = []
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const cancel = vi.fn()
      calls.push({ element: this, keyframes, options, cancel })
      return { cancel }
    }
  })
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduced && query.includes('reduce'), media: query }))
  )
}

const panel = (index: number, src = `file:///v${index}.png`) => (
  <CoverPanel showDeck deckMore coverSrc={src} variantIndex={index} />
)
const named = (container: HTMLElement, call: Call) =>
  call.element.getAttribute('data-deck')
    ? `deck${call.element.getAttribute('data-deck')}`
    : call.element === container.querySelector('[aria-label="Cover"]')
      ? 'cover'
      : 'ghost'

beforeEach(() => {
  stubAnimate()
  stubReducedMotion(false)
})
afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate
  vi.unstubAllGlobals()
})

describe('CoverPanel · deck motion', () => {
  it('plays nothing on mount, and nothing when only the cover file changes', () => {
    const { rerender } = render(panel(2))
    expect(calls).toHaveLength(0)
    rerender(panel(2, 'file:///replaced.png'))
    expect(calls).toHaveLength(0)
  })

  it('next: the old top card slides left and fades while the cards behind rise, and a card joins the back', () => {
    const { container, rerender } = render(panel(0))
    rerender(panel(1))
    const byName = Object.fromEntries(calls.map((call) => [named(container, call), call]))
    expect(Object.keys(byName).sort()).toEqual(['cover', 'deck1', 'deck2', 'ghost'])
    expect(byName.ghost!.options).toMatchObject({ duration: 120, easing: EASE_IN })
    expect(byName.cover!.options).toMatchObject({ duration: 200, delay: 40, easing: EASE_OUT })
    expect(byName.deck1!.options).toMatchObject({ duration: 200, delay: 40 })
    expect(byName.deck2!.options).toMatchObject({ duration: 120, delay: 100 })
  })

  it('next: the leaving card shows the cover that was on top', () => {
    const { container, rerender } = render(panel(0))
    rerender(panel(1))
    const ghost = container.querySelector<HTMLImageElement>('img[aria-hidden]')!
    expect(ghost.getAttribute('src')).toBe('file:///v0.png')
  })

  it('previous: the reverse in one base-length ease-out, with no card leaving', () => {
    const { container, rerender } = render(panel(3))
    rerender(panel(2))
    const names = calls.map((call) => named(container, call)).sort()
    expect(names).toEqual(['cover', 'deck1', 'deck2'])
    for (const call of calls) {
      expect(call.options).toMatchObject({ duration: 200, easing: EASE_OUT })
      expect(call.options.delay).toBeUndefined()
    }
  })

  it('plays one step for a jump, in the direction it went', () => {
    const { rerender } = render(panel(1))
    rerender(panel(9))
    const nextCount = calls.length
    expect(nextCount).toBe(4)
    calls = []
    rerender(panel(2))
    expect(calls).toHaveLength(3)
  })

  it('never queues: a new switch cancels what is still running, then plays from there', () => {
    const { rerender } = render(panel(0))
    rerender(panel(1))
    const first = [...calls]
    rerender(panel(2))
    for (const call of first) expect(call.cancel).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(first.length * 2)
    for (const call of calls.slice(first.length)) expect(call.cancel).not.toHaveBeenCalled()
  })

  it('reduced motion is a 120ms crossfade with no movement', () => {
    stubReducedMotion(true)
    const { container, rerender } = render(panel(0))
    rerender(panel(1))
    expect(calls).toHaveLength(1)
    expect(named(container, calls[0]!)).toBe('cover')
    expect(calls[0]!.options.duration).toBe(120)
    expect(JSON.stringify(calls[0]!.keyframes)).not.toContain('transform')
    calls = []
    rerender(panel(0))
    expect(calls).toHaveLength(1)
  })

  it('moves only the cards that are on the deck', () => {
    const { container, rerender } = render(<CoverPanel coverSrc="file:///a.png" variantIndex={0} />)
    rerender(<CoverPanel coverSrc="file:///b.png" variantIndex={1} />)
    expect(calls.map((call) => named(container, call)).sort()).toEqual(['cover', 'ghost'])
  })

  it('does nothing without a variant index, such as in Look it over', () => {
    const { rerender } = render(<CoverPanel coverSrc="file:///a.png" />)
    rerender(<CoverPanel coverSrc="file:///b.png" />)
    expect(calls).toHaveLength(0)
  })

  it('is harmless where the Web Animations API is missing', () => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate
    const { rerender } = render(panel(0))
    expect(() => rerender(panel(1))).not.toThrow()
  })
})
