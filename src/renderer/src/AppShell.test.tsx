import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import AppShell from './AppShell'
import { useUiStore } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { shortcuts } from './lib/shortcuts'
import { IPC_CHANNELS } from '@shared/ipc'

beforeEach(() => {
  useUiStore.setState({ view: 'all', modal: null, settingsOpen: false })
  useLibraryStore.setState({
    query: '',
    stats: { total: 128, favourites: 12, groups: 0, trashed: 3 }
  })
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async () => ({ success: true, data: {} })),
    subscribe: vi.fn(() => () => {}),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((f) => `/path/${(f as File).name}`)
  } as unknown as typeof window.api
})

const press = (init: KeyboardEventInit) =>
  fireEvent.keyDown(document.body, { bubbles: true, cancelable: true, ...init })

describe('AppShell navigation', () => {
  it('renders the sidebar', () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    )
    for (const name of [/Add a mockup/, /My Stash/, /Starred/, /All/, /Trash/, /Settings/]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('shows counts from the library stats', () => {
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.getByRole('button', { name: /Starred/ }).textContent).toContain('12')
    expect(screen.getByRole('button', { name: /Trash/ }).textContent).toContain('3')
    expect(screen.getByRole('button', { name: /^All/ }).textContent).toContain('128')
  })

  it('marks the current page', () => {
    useUiStore.setState({ view: 'starred' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.getByRole('button', { name: /Starred/ }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-current')).toBeNull()
  })

  it.each([
    ['Trash', 'trash'],
    ['Starred', 'starred'],
    ['All', 'all']
  ])('clicking %s sets the view to %s', (name, view) => {
    useUiStore.setState({ view: view === 'all' ? 'trash' : 'all' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
    expect(useUiStore.getState().view).toBe(view)
  })

  it('opens Settings as a modal over the page without leaving it, and marks it', () => {
    useUiStore.setState({ view: 'all', settingsOpen: false })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
    expect(useUiStore.getState().settingsOpen).toBe(true)
    expect(useUiStore.getState().view).toBe('all')
    expect(screen.getByRole('dialog').getAttribute('data-ds')).toBe('SettingsModal')
    expect(
      screen.getByRole('button', { name: /^Settings$/, hidden: true }).getAttribute('aria-current')
    ).toBe('page')
  })

  it('renders children in the page area', () => {
    render(
      <AppShell>
        <div>hello world</div>
      </AppShell>
    )
    expect(screen.getByRole('main').textContent).toContain('hello world')
  })
})

describe('AppShell header', () => {
  it('titles My Stash with the total and the favourites note', () => {
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My StashAll')
    expect(screen.getByText('128 mockups')).toBeTruthy()
  })

  it('titles Starred with the favourites count', () => {
    useUiStore.setState({ view: 'starred' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My StashStarred')
    expect(screen.getByText('12 mockups')).toBeTruthy()
  })

  it('keeps the header at zero mockups', () => {
    useLibraryStore.setState({ stats: { total: 0, favourites: 0, groups: 0, trashed: 0 } })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.getByText(/^0 mockups/)).toBeTruthy()
  })

  it.each(['settings'] as const)('leaves the heading to the %s page', (view) => {
    useUiStore.setState({ view })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('can hide the header for pipeline screens', () => {
    render(
      <AppShell showHeader={false}>
        <div />
      </AppShell>
    )
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('AppShell search', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const search = (text: string) => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: text } })
    act(() => void vi.advanceTimersByTime(250))
  }

  it('sets the library query', () => {
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    search('phone clay')
    expect(useLibraryStore.getState().query).toBe('phone clay')
  })

  it('takes you to My Stash when you search from Trash', () => {
    useUiStore.setState({ view: 'trash' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    search('clay')
    expect(useUiStore.getState().view).toBe('all')
  })

  it('does not move you when the search is cleared', () => {
    useUiStore.setState({ view: 'trash' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    search('')
    expect(useUiStore.getState().view).toBe('trash')
  })
})

describe('AppShell import', () => {
  it('disables Add while an import runs', () => {
    render(
      <AppShell importing>
        <div />
      </AppShell>
    )
    expect(
      (screen.getByRole('button', { name: /Add a mockup/ }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(screen.getByText('Import running…')).toBeTruthy()
  })

  it('puts the import card in the activity dock', () => {
    const { baseElement } = render(
      <AppShell importCard={<p>Copying</p>}>
        <div />
      </AppShell>
    )
    expect(baseElement.querySelector('[data-ds="ActivityDock"]')?.textContent).toContain('Copying')
  })

  it('shows the drop overlay while dragging', () => {
    const { baseElement, rerender } = render(
      <AppShell isDropping>
        <div />
      </AppShell>
    )
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).toBeTruthy()
    rerender(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('passes drops on the window to the handler', () => {
    const onDrop = vi.fn()
    const { baseElement } = render(
      <AppShell onDrop={onDrop}>
        <div />
      </AppShell>
    )
    fireEvent.drop(baseElement.querySelector('[data-slot="app-shell"]')!)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})

describe('AppShell shortcuts', () => {
  it('⌘O adds files and ⇧⌘O adds a folder', () => {
    const onAddFiles = vi.fn()
    const onAddFolder = vi.fn()
    render(
      <AppShell onAddFiles={onAddFiles} onAddFolder={onAddFolder}>
        <div />
      </AppShell>
    )
    press({ key: 'o', metaKey: true })
    expect(onAddFiles).toHaveBeenCalledTimes(1)
    expect(onAddFolder).not.toHaveBeenCalled()
    press({ key: 'O', metaKey: true, shiftKey: true })
    expect(onAddFolder).toHaveBeenCalledTimes(1)
  })

  it('ignores them while an import runs', () => {
    const onAddFiles = vi.fn()
    render(
      <AppShell importing onAddFiles={onAddFiles}>
        <div />
      </AppShell>
    )
    press({ key: 'o', metaKey: true })
    expect(onAddFiles).not.toHaveBeenCalled()
  })

  it('⌘K focuses the search field', () => {
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    press({ key: 'k', metaKey: true })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' }))
  })

  it('has no duplicate bindings, and ⌘K is taken', () => {
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    const combos = shortcuts.list().map((s) => `${s.scope}:${s.combo}`)
    expect(new Set(combos).size).toBe(combos.length)
    expect(combos).toContain('global:mod+k')
    expect(() => shortcuts.register({ id: 'rival', combo: 'mod+k', handler: vi.fn() })).toThrow()
  })

  it('releases its bindings on unmount', () => {
    const { unmount } = render(
      <AppShell>
        <div />
      </AppShell>
    )
    unmount()
    expect(shortcuts.list()).toEqual([])
  })
})

describe('AppShell modals', () => {
  it('renders a modal outside the page', () => {
    useUiStore.setState({
      modal: {
        kind: 'confirm',
        title: 'Empty Trash?',
        message: 'Gone for good.',
        onConfirm: vi.fn()
      }
    })
    const { baseElement } = render(
      <AppShell>
        <div>page</div>
      </AppShell>
    )
    expect(baseElement.querySelector('[data-slot="modal-layer"]')).toBeTruthy()
    expect(screen.getByText('Empty Trash?')).toBeTruthy()
    expect(baseElement.querySelector('main')?.textContent).not.toContain('Empty Trash?')
  })

  it('has no modal layer without a modal', () => {
    const { baseElement } = render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(baseElement.querySelector('[data-slot="modal-layer"]')).toBeNull()
  })
})

describe('AppShell inbox counts', () => {
  const withInbox = (counts: object) => {
    let push: (payload: unknown) => void = () => {}
    window.api = {
      ...window.api,
      invoke: vi.fn(async (channel: string) =>
        channel === IPC_CHANNELS.INBOX_COUNTS
          ? { success: true, data: counts }
          : { success: true, data: {} }
      ),
      subscribe: vi.fn((_channel: string, cb: (payload: unknown) => void) => {
        push = cb
        return () => {}
      })
    } as unknown as typeof window.api
    return (payload: unknown) => act(() => push(payload))
  }
  const mount = () =>
    render(
      <AppShell>
        <div />
      </AppShell>
    )

  it('lists To sort and To stash with counts once they are above 0', async () => {
    withInbox({ toSort: 38, toStash: 12, sniffing: 0, trash: 3 })
    mount()
    expect((await screen.findByRole('button', { name: /To sort/ })).textContent).toContain('38')
    expect(screen.getByRole('button', { name: /To stash/ }).textContent).toContain('12')
  })

  it('hides empty inboxes', async () => {
    withInbox({ toSort: 0, toStash: 0, sniffing: 0, trash: 3 })
    mount()
    await screen.findByRole('button', { name: /Trash/ })
    expect(screen.queryByRole('button', { name: /To sort/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /To stash/ })).toBeNull()
  })

  it('updates live from push events, Trash included', async () => {
    const push = withInbox({ toSort: 0, toStash: 0, sniffing: 0, trash: 3 })
    mount()
    await screen.findByRole('button', { name: /Trash/ })
    push({ toSort: 5, toStash: 0, sniffing: 0, trash: 7 })
    expect(screen.getByRole('button', { name: /To sort/ }).textContent).toContain('5')
    expect(screen.getByRole('button', { name: /Trash/ }).textContent).toContain('7')
  })

  it('opens the inbox pages', async () => {
    withInbox({ toSort: 2, toStash: 4, sniffing: 0, trash: 0 })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    fireEvent.click(await screen.findByRole('button', { name: /To sort/ }))
    expect(useUiStore.getState().view).toBe('to-sort')
    fireEvent.click(screen.getByRole('button', { name: /To stash/ }))
    expect(useUiStore.getState().view).toBe('to-stash')
  })

  it.each([
    ['to-sort', 'To sort', '2 mockups waiting to be sorted'],
    ['to-stash', 'To stash', '4 piles and mockups waiting'],
    ['trash', 'Trash', '3 items']
  ] as const)('titles the %s page', async (view, title, description) => {
    withInbox({ toSort: 2, toStash: 4, sniffing: 0, trash: 3 })
    useUiStore.setState({ view })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(await screen.findByText(description)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title)
  })
})

describe('AppShell controlled search', () => {
  it('shows the text from the ui store', () => {
    useUiStore.setState({ searchText: 'clay' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('clay')
  })

  it('typing updates the store at once, the library query after the pause', () => {
    vi.useFakeTimers()
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'ph' } })
    expect(useUiStore.getState().searchText).toBe('ph')
    expect(useLibraryStore.getState().query).toBe('')
    act(() => void vi.advanceTimersByTime(250))
    expect(useLibraryStore.getState().query).toBe('ph')
    vi.useRealTimers()
  })

  it('empties the field when the page clears the query', () => {
    useUiStore.setState({ searchText: 'clay' })
    useLibraryStore.setState({ query: 'clay' })
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    act(() => useLibraryStore.getState().setQuery(''))
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('')
  })
})
