import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AppShell from './AppShell'
import { useUiStore } from './stores/uiStore'

beforeEach(() => {
  useUiStore.setState({ view: 'library', modal: null })
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async () => ({ success: true, data: {} })),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((f) => `/path/${(f as File).name}`),
  } as unknown as typeof window.api
})

describe('AppShell', () => {
  it('renders sidebar nav items', () => {
    render(<AppShell><div>content</div></AppShell>)
    expect(screen.getByText('Library')).toBeTruthy()
    expect(screen.getByText('Trash')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('DesignStash')).toBeTruthy()
  })

  it('clicking Trash sets view to trash', () => {
    render(<AppShell><div>content</div></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    expect(useUiStore.getState().view).toBe('trash')
  })

  it('clicking Library sets view to library', () => {
    useUiStore.setState({ view: 'trash' })
    render(<AppShell><div>content</div></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(useUiStore.getState().view).toBe('library')
  })

  it('renders children in the main area', () => {
    render(<AppShell><div>hello world</div></AppShell>)
    expect(screen.getByText('hello world')).toBeTruthy()
  })
})
