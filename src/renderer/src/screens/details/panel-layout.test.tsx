import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { PanelSurface } from './PanelSurface'
import { usePanelLayout } from './use-panel-layout'

afterEach(() => {
  vi.restoreAllMocks()
  delete (document as { startViewTransition?: unknown }).startViewTransition
  delete document.documentElement.dataset.panelMotion
})

const noMotionPreference = () =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }) as unknown as MediaQueryList
  )

describe('PanelSurface', () => {
  it('is on screen only while open, and carries the sidebar’s transition name', () => {
    const { rerender } = render(<PanelSurface open>content</PanelSurface>)
    const panel = screen.getByText('content')
    expect(panel.getAttribute('data-slot')).toBe('details-panel')
    expect(panel.style.viewTransitionName).toBe('details-panel')
    // Nothing inside animates on its own: the slide is the view transition's.
    expect(panel.style.transition).toBe('')
    rerender(<PanelSurface open={false}>content</PanelSurface>)
    expect(screen.queryByText('content')).toBeNull()
  })
})

describe('usePanelLayout', () => {
  it('follows the selection at once when there are no view transitions', () => {
    noMotionPreference()
    const { result, rerender } = renderHook(({ open }) => usePanelLayout(open), {
      initialProps: { open: false }
    })
    expect(result.current).toBe(false)
    rerender({ open: true })
    expect(result.current).toBe(true)
    rerender({ open: false })
    expect(result.current).toBe(false)
  })

  it('changes the layout inside a view transition, not before it', () => {
    noMotionPreference()
    let update: () => void = () => {}
    const skip = vi.fn()
    ;(document as unknown as { startViewTransition: unknown }).startViewTransition = vi.fn(
      (callback: () => void) => {
        update = callback
        return { finished: new Promise(() => {}), skipTransition: skip }
      }
    )
    const { result, rerender } = renderHook(({ open }) => usePanelLayout(open), {
      initialProps: { open: false }
    })
    rerender({ open: true })
    // The browser has captured the old layout; the new one is not applied until it asks for it.
    expect(result.current).toBe(false)
    expect(document.documentElement.dataset.panelMotion).toBe('open')
    act(() => update())
    expect(result.current).toBe(true)
  })

  it('ends in the right layout when a second toggle skips the first', () => {
    noMotionPreference()
    const updates: Array<() => void> = []
    const skip = vi.fn()
    ;(document as unknown as { startViewTransition: unknown }).startViewTransition = vi.fn(
      (callback: () => void) => {
        updates.push(callback)
        return { finished: new Promise(() => {}), skipTransition: skip }
      }
    )
    const { result, rerender } = renderHook(({ open }) => usePanelLayout(open), {
      initialProps: { open: false }
    })
    rerender({ open: true })
    rerender({ open: false })
    expect(skip).toHaveBeenCalledOnce()
    act(() => updates.forEach((update) => update()))
    expect(result.current).toBe(false)
  })

  it('does not animate under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }) as unknown as MediaQueryList
    )
    const start = vi.fn()
    ;(document as unknown as { startViewTransition: unknown }).startViewTransition = start
    const { result, rerender } = renderHook(({ open }) => usePanelLayout(open), {
      initialProps: { open: false }
    })
    rerender({ open: true })
    expect(start).not.toHaveBeenCalled()
    expect(result.current).toBe(true)
  })
})
