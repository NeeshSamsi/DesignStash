import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { useRevealSelected } from './use-reveal-selected'

function Host({ open }: { open: boolean }) {
  useRevealSelected(open)
  return (
    <div>
      <div data-mockup-id="7">seven</div>
    </div>
  )
}

let scrollIntoView: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView =
    scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
  useDetailsStore.setState({ target: { id: 7, edit: false } })
})
afterEach(() => {
  vi.useRealTimers()
  useDetailsStore.setState({ target: null })
})

describe('useRevealSelected', () => {
  it('scrolls the selected card into view, only as far as needed, once the panel is open', () => {
    const { rerender } = render(<Host open={false} />)
    act(() => void vi.advanceTimersByTime(50))
    expect(scrollIntoView).not.toHaveBeenCalled()
    rerender(<Host open />)
    act(() => void vi.advanceTimersByTime(50))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })

  it('does nothing without a selection', () => {
    useDetailsStore.setState({ target: null })
    render(<Host open />)
    act(() => void vi.advanceTimersByTime(50))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
