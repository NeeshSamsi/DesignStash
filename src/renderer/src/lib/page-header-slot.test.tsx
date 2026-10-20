import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppShell from '@renderer/AppShell'
import { useUiStore } from '@renderer/stores/uiStore'
import { HeaderActions, useHeaderSlot, useHeaderStatus } from './page-header-slot'

function Page({ status }: { status?: string }) {
  useHeaderStatus(status)
  return (
    <HeaderActions>
      <button type="button">Sort</button>
    </HeaderActions>
  )
}

describe('page header slot', () => {
  beforeEach(() => {
    window.api = {
      appName: 'DesignStash',
      invoke: vi.fn(async () => ({ success: true, data: {} })),
      subscribe: vi.fn(() => () => {}),
      getPathForFile: vi.fn()
    } as unknown as typeof window.api
  })

  it('puts a page’s actions in the header, on the title row', () => {
    useUiStore.setState({ view: 'to-sort' })
    const { baseElement } = render(
      <AppShell>
        <Page />
      </AppShell>
    )
    const header = baseElement.querySelector('[data-ds="PageHeader"]')!
    expect(header.contains(screen.getByRole('button', { name: 'Sort' }))).toBe(true)
  })

  it('shows a page’s status line under the title, and clears it when the page goes', () => {
    useUiStore.setState({ view: 'to-sort' })
    const { rerender } = render(
      <AppShell>
        <Page status="AI suggestions ready for all 4" />
      </AppShell>
    )
    expect(screen.getByText(/AI suggestions ready for all 4/)).toBeTruthy()
    rerender(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.queryByText(/AI suggestions ready/)).toBeNull()
    expect(useHeaderSlot.getState().status).toBeNull()
  })

  it('renders the actions in place when no header is on show', () => {
    render(<Page />)
    expect(screen.getByRole('button', { name: 'Sort' })).toBeTruthy()
  })
})
