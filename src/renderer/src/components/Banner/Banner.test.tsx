import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Banner, type BannerProps } from './Banner'
import { BANNER_CONTRACT } from './Banner.types'

describe('Banner', () => {
  it.each(variantMatrix(BANNER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Banner {...(props as BannerProps)} />)
    expect(baseElement.querySelector('[data-ds="Banner"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Banner />)
    for (const text of Object.values<string>(BANNER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('shows the action only with a label, and fires it', () => {
    const onAction = vi.fn()
    const { rerender } = render(<Banner action />)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    rerender(<Banner action actionLabel="Retry" onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('dismisses', () => {
    const onDismiss = vi.fn()
    render(<Banner dismissible onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('announces errors and keeps the rest polite', () => {
    const { rerender } = render(<Banner tone="error" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    rerender(<Banner tone="info" />)
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
