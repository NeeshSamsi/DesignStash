import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { useRef } from 'react'
import { PANEL_LEAVE_MS, PanelSurface } from './PanelSurface'
import { PANEL_SHARE, usePanelGrid } from './use-panel-grid'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const raf = () => act(() => vi.advanceTimersByTime(50))

describe('PanelSurface', () => {
  it('starts out of view to the right, then slides in as one block', () => {
    render(<PanelSurface open>content</PanelSurface>)
    const panel = screen.getByText('content')
    expect(panel.getAttribute('data-slot')).toBe('details-panel')
    expect(panel.className).toContain('translate-x-99')
    expect(panel.className).toContain('opacity-0')
    expect(panel.style.transition).toContain('var(--ease-panel-out)')
    raf()
    expect(panel.className).not.toContain('translate-x-99')
    expect(panel.className).not.toContain('opacity-0')
  })

  it('leaves with the panel-in ease and drops its content afterwards', () => {
    const { rerender } = render(<PanelSurface open>content</PanelSurface>)
    raf()
    rerender(<PanelSurface open={false}>content</PanelSurface>)
    const panel = screen.getByText('content')
    expect(panel.style.transition).toContain('var(--ease-panel-in)')
    expect(panel.style.transition).toContain('var(--duration-panel-close)')
    act(() => vi.advanceTimersByTime(PANEL_LEAVE_MS + 10))
    expect(screen.queryByText('content')).toBeNull()
  })

  it('only fades with reduced motion: no slide', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }) as unknown as MediaQueryList
    )
    render(<PanelSurface open>content</PanelSurface>)
    const panel = screen.getByText('content')
    expect(panel.className).not.toContain('translate-x-99')
    expect(panel.style.transition).toBe('opacity 150ms linear')
  })
})

describe('usePanelGrid', () => {
  function useHarness(open: boolean) {
    const ref = useRef<HTMLDivElement>(document.createElement('div'))
    Object.defineProperty(ref.current, 'offsetWidth', { value: 1000, configurable: true })
    return usePanelGrid(open, ref)
  }

  it('holds the page at its final width as soon as the sidebar is asked for', () => {
    const { result, rerender } = renderHook(({ open }) => useHarness(open), {
      initialProps: { open: false }
    })
    expect(result.current).toBeNull()
    rerender({ open: true })
    expect(result.current).toBe(1000 - PANEL_SHARE)
  })

  it('lets the page widen once the container has finished closing', () => {
    const { result, rerender } = renderHook(({ open }) => useHarness(open), {
      initialProps: { open: false }
    })
    rerender({ open: true })
    rerender({ open: false })
    expect(result.current).toBe(1000 - PANEL_SHARE)
    act(() => vi.advanceTimersByTime(230))
    expect(result.current).toBeNull()
  })

  it('stays narrow when the sidebar is asked for again mid-close', () => {
    const { result, rerender } = renderHook(({ open }) => useHarness(open), {
      initialProps: { open: false }
    })
    rerender({ open: true })
    rerender({ open: false })
    act(() => vi.advanceTimersByTime(100))
    rerender({ open: true })
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(1000 - PANEL_SHARE)
  })
})
