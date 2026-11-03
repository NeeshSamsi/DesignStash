import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ErrorState, type ErrorStateProps } from './ErrorState'
import { ERROR_STATE_CONTRACT } from './ErrorState.types'

describe('ErrorState', () => {
  it.each(variantMatrix(ERROR_STATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ErrorState {...(props as ErrorStateProps)} />)
    expect(baseElement.querySelector('[data-ds="ErrorState"]')).not.toBeNull()
  })

  it('renders the Figma default text, except the technical code', () => {
    render(<ErrorState />)
    const { code, ...texts } = ERROR_STATE_CONTRACT.texts
    for (const text of Object.values<string>(texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(screen.queryByText(code)).toBeNull()
  })

  it('never renders the code, even with details on', () => {
    for (const variant of ['page', 'full-window'] as const) {
      const { container, unmount } = render(
        <ErrorState variant={variant} showDetails code="LIBRARY_LIST · SQLITE_BUSY" />
      )
      expect(container.textContent).not.toMatch(/SQLITE|LIBRARY_LIST/)
      unmount()
    }
  })

  it('keeps details off by default and offers Copy report when on', () => {
    const onCopyReport = vi.fn()
    const { rerender } = render(<ErrorState variant="page" />)
    expect(screen.queryByRole('button', { name: 'Copy report' })).toBeNull()
    rerender(<ErrorState variant="page" showDetails onCopyReport={onCopyReport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }))
    expect(onCopyReport).toHaveBeenCalledTimes(1)
  })

  it('retries from every variant', () => {
    for (const variant of ['inline', 'page', 'full-window'] as const) {
      const onRetry = vi.fn()
      const { unmount } = render(
        <ErrorState variant={variant} onRetry={onRetry} retryLabel="Try again" />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
      unmount()
    }
  })

  it('runs the actions light to heavy: the secondary first, the primary on the right', () => {
    const labels = {
      page: ['Check your stash', 'Retry'],
      'full-window': ['Quit', 'Reload']
    } as const
    for (const variant of ['page', 'full-window'] as const) {
      const { unmount } = render(<ErrorState variant={variant} />)
      const names = screen.getAllByRole('button').map((b) => b.textContent)
      expect(names).toEqual(labels[variant])
      unmount()
    }
  })

  it('leaves the primary alone on the right when there is no secondary', () => {
    render(<ErrorState variant="page" secondaryLabel={null} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Retry'])
  })
})
