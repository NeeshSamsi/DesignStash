import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CopyWidget, type CopyWidgetProps } from './CopyWidget'
import { COPY_WIDGET_CONTRACT } from './CopyWidget.types'

describe('CopyWidget', () => {
  it.each(variantMatrix(COPY_WIDGET_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CopyWidget {...(props as CopyWidgetProps)} />)
    expect(baseElement.querySelector('[data-ds="CopyWidget"]')).not.toBeNull()
  })
})

describe('CopyWidget behaviour', () => {
  it('stopped asks keep or undo', () => {
    const onKeep = vi.fn()
    const onUndoAll = vi.fn()
    render(<CopyWidget state="stopped" keepCount={12} onKeep={onKeep} onUndoAll={onUndoAll} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep 12' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo all' }))
    expect(onKeep).toHaveBeenCalledOnce()
    expect(onUndoAll).toHaveBeenCalledOnce()
  })

  it('error offers Retry and Cancel', () => {
    const onRetry = vi.fn()
    render(<CopyWidget state="error" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeNull()
  })

  it('collapsed hides the file list and footer', () => {
    render(<CopyWidget view="collapsed" files={<p>phone_front.psd</p>} />)
    expect(screen.queryByText('phone_front.psd')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('done has no footer and can be dismissed', () => {
    const onDismiss = vi.fn()
    render(<CopyWidget state="done" onDismiss={onDismiss} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('moreBelow shows the bottom fade', () => {
    const { container } = render(<CopyWidget moreBelow />)
    expect(container.querySelector('.bg-gradient-to-t')).not.toBeNull()
    expect(container.querySelector('.bg-gradient-to-b')).toBeNull()
  })
})
