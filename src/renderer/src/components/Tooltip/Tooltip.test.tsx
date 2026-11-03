import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from './Tooltip'

afterEach(() => {
  vi.useRealTimers()
})

describe('Tooltip', () => {
  it('labels its trigger: focus shows the label, placed by its arrow', async () => {
    render(
      <Tooltip arrow="bottom-left" label="Open in Photoshop">
        <button type="button">Open</button>
      </Tooltip>
    )
    fireEvent.focus(screen.getByRole('button', { name: 'Open' }))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.textContent).toBe('Open in Photoshop')
    const panel = tooltip.closest('[data-ds="Tooltip"]')!
    expect(panel.getAttribute('data-side')).toBe('top')
    expect(panel.getAttribute('data-align')).toBe('start')
  })

  it('lets the caller decide when it opens, as a cut-off title does', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <Tooltip arrow="none" label="A very long title" open={false} onOpenChange={onOpenChange}>
        <span tabIndex={0}>A very long…</span>
      </Tooltip>
    )
    fireEvent.focus(screen.getByText('A very long…'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('tooltip')).toBeNull()

    rerender(
      <Tooltip arrow="none" label="A very long title" open onOpenChange={onOpenChange}>
        <span tabIndex={0}>A very long…</span>
      </Tooltip>
    )
    expect(screen.getByRole('tooltip').textContent).toBe('A very long title')
  })

  it('waits its delay before a hover opens it', () => {
    vi.useFakeTimers()
    const onOpenChange = vi.fn()
    render(
      <Tooltip arrow="none" label="Full name" delayDuration={400} onOpenChange={onOpenChange}>
        <span>Short</span>
      </Tooltip>
    )
    fireEvent.pointerMove(screen.getByText('Short'))
    act(() => vi.advanceTimersByTime(300))
    expect(onOpenChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})
