import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ReconciliationPanel, type ReconciliationPanelProps } from './ReconciliationPanel'
import { RECONCILIATION_PANEL_CONTRACT } from './ReconciliationPanel.types'

describe('ReconciliationPanel', () => {
  it.each(variantMatrix(RECONCILIATION_PANEL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ReconciliationPanel {...(props as ReconciliationPanelProps)} />)
    expect(baseElement.querySelector('[data-ds="ReconciliationPanel"]')).not.toBeNull()
  })
})

describe('ReconciliationPanel behaviour', () => {
  it('drift lists both groups with the row and bulk actions', () => {
    render(<ReconciliationPanel state="drift" />)
    expect(screen.getByText('Found in your stash folder')).not.toBeNull()
    expect(screen.getByText('Gone from your stash folder')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Ignore' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Relink…' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Add all' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Remove all' })).not.toBeNull()
  })

  it('reports N left and keeps Done off until nothing is left', () => {
    const { rerender } = render(<ReconciliationPanel state="drift" />)
    expect(screen.getByText('3 left')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<ReconciliationPanel state="drift" found={[]} gone={[]} />)
    expect(screen.getByText('0 left')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls back with the row id', () => {
    const onAdd = vi.fn()
    const onRelink = vi.fn()
    const onIgnoreAll = vi.fn()
    render(
      <ReconciliationPanel
        state="drift"
        found={[{ id: 'a', name: 'a.psd' }]}
        gone={[{ id: 'b', name: 'B' }]}
        onAdd={onAdd}
        onRelink={onRelink}
        onIgnoreAll={onIgnoreAll}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Relink…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ignore all' }))
    expect(onAdd).toHaveBeenCalledWith('a')
    expect(onRelink).toHaveBeenCalledWith('b')
    expect(onIgnoreAll).toHaveBeenCalledOnce()
  })

  it('hides a group once it is empty', () => {
    render(<ReconciliationPanel state="drift" found={[]} />)
    expect(screen.queryByText('Found in your stash folder')).toBeNull()
    expect(screen.getByText('Gone from your stash folder')).not.toBeNull()
  })

  it('resolving swaps the working row to a disabled Adding… and locks the rest', () => {
    render(<ReconciliationPanel state="resolving" resolvingId="poster_new" />)
    expect((screen.getByRole('button', { name: 'Adding…' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('checking shows skeleton rows, never a spinner, with Ignore all and Done off', () => {
    const { container } = render(<ReconciliationPanel state="rescanning" />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole('status')).toBeNull()
    expect((screen.getByRole('button', { name: 'Ignore all' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('all-resolved says so and enables Done', () => {
    const onDone = vi.fn()
    render(<ReconciliationPanel state="all-resolved" onDone={onDone} />)
    expect(screen.getByText('All sorted')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Ignore all' })).toBeNull()
  })

  it('shows plain names with no path or code', () => {
    const { container } = render(<ReconciliationPanel state="drift" />)
    expect(container.textContent).not.toMatch(/\/Users|\\|ENOENT|0x/)
  })
})
