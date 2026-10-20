import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ModelRow, type ModelRowProps } from './ModelRow'
import { MODEL_ROW_CONTRACT } from './ModelRow.types'

describe('ModelRow', () => {
  it.each(variantMatrix(MODEL_ROW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ModelRow {...(props as ModelRowProps)} />)
    expect(baseElement.querySelector('[data-ds="ModelRow"]')).not.toBeNull()
  })
})

describe('ModelRow behaviour', () => {
  it('picks the model from the radio and from the row, but not from the inline buttons', () => {
    const onSelect = vi.fn()
    const onPause = vi.fn()
    render(
      <ModelRow state="downloading" name="Qwen 2.5 VL 3B" onSelect={onSelect} onPause={onPause} />
    )
    fireEvent.click(screen.getByRole('radio'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Pause Qwen 2.5 VL 3B' }))
    expect(onPause).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('paused offers Resume', () => {
    const onResume = vi.fn()
    render(<ModelRow state="paused" onResume={onResume} />)
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('failed says why in plain words and offers Retry', () => {
    const onRetry = vi.fn()
    render(<ModelRow state="failed" onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toMatch(/try again/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('installed is unchosen until picked', () => {
    render(<ModelRow state="installed" />)
    expect(screen.getByRole('radio').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Downloaded')).not.toBeNull()
  })
})
