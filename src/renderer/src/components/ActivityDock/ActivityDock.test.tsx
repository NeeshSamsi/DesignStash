import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ActivityDock, type ActivityDockProps } from './ActivityDock'
import { ACTIVITY_DOCK_CONTRACT } from './ActivityDock.types'

describe('ActivityDock', () => {
  it.each(variantMatrix(ACTIVITY_DOCK_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ActivityDock {...(props as ActivityDockProps)} />)
    expect(baseElement.querySelector('[data-ds="ActivityDock"]')).not.toBeNull()
  })
})

describe('ActivityDock behaviour', () => {
  it('stacks what it is given and draws no placeholder', () => {
    const { baseElement } = render(
      <ActivityDock toastContent={<p>toast</p>} importContent={<p>copy</p>} />
    )
    const dock = baseElement.querySelector('[data-ds="ActivityDock"]')!
    expect(Array.from(dock.children).map((c) => c.textContent)).toEqual(['toast', 'copy'])
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('respects the toast and import switches', () => {
    render(
      <ActivityDock
        toast={false}
        import={false}
        toastContent={<p>toast</p>}
        importContent={<p>copy</p>}
      />
    )
    expect(screen.queryByText('toast')).toBeNull()
    expect(screen.queryByText('copy')).toBeNull()
  })

  it('shows the debug button only in dev', () => {
    const onDebug = vi.fn()
    const { rerender } = render(<ActivityDock onDebug={onDebug} />)
    expect(screen.queryByRole('button', { name: 'Open debug panel' })).toBeNull()
    rerender(<ActivityDock build="dev" onDebug={onDebug} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open debug panel' }))
    expect(onDebug).toHaveBeenCalledTimes(1)
  })
})
