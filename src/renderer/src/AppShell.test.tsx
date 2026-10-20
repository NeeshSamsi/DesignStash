import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import AppShell from './AppShell'
import { useUiStore } from './stores/uiStore'
import { useLibraryStore } from './stores/libraryStore'
import { useDetailsStore } from './stores/detailsStore'
import { shortcuts } from './lib/shortcuts'
import { toast as sonnerToast } from 'sonner'
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
    for (const name of [/My Stash/, /Starred/, /All/, /Trash/, /Settings/]) {
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
    expect(useUiStore.getState().settingsSection).toBe('my-stash')
    expect(useUiStore.getState().view).toBe('all')
    expect(screen.getByRole('dialog').getAttribute('data-ds')).toBe('SettingsModal')
    expect(
      screen.getByRole('button', { name: /^Settings$/, hidden: true }).getAttribute('aria-current')
    ).toBe('page')
  })

  it('opens Settings on the pane that was asked for', () => {
    render(
      <AppShell>
        <div />
      </AppShell>
    )
    act(() => useUiStore.getState().openSettings('tags'))
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Tags', hidden: true }).getAttribute('aria-current')
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
  it('has no Add button in the sidebar: adding lives in the Add card', () => {
    render(
      <AppShell copyWidget={<p>Copying 12 of 40</p>}>
        <div />
      </AppShell>
    )
    expect(screen.queryByRole('button', { name: /Add a mockup/ })).toBeNull()
    expect(screen.getByText('Copying 12 of 40')).toBeTruthy()
  })

  it('shows the drop overlay it is given over the window', () => {
    const { baseElement, rerender } = render(
      <AppShell dropOverlay={<div data-ds="DropOverlay" />}>
        <div />
      </AppShell>
    )
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).toBeTruthy()
    expect(baseElement.querySelector('[data-ds="AppWindow"]')?.getAttribute('data-state')).toBe(
      'drag-over'
    )
    rerender(
      <AppShell>
        <div />
      </AppShell>
    )
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('shows the drop hint and the copy widget it is given', () => {
    const { baseElement } = render(
      <AppShell dropHint={<p>hint</p>} copyWidget={<p>widget</p>}>
        <div />
      </AppShell>
    )
    expect(screen.getByText('hint')).toBeTruthy()
    expect(baseElement.querySelector('[data-ds="ActivityDock"]')?.textContent).toContain('widget')
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

  it('still adds files with ⌘O while a copy runs', () => {
    const onAddFiles = vi.fn()
    render(
      <AppShell copyWidget={<p>Copying</p>} onAddFiles={onAddFiles}>
        <div />
      </AppShell>
    )
    press({ key: 'o', metaKey: true })
    expect(onAddFiles).toHaveBeenCalledTimes(1)
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
        kind: 'reconcile',
        report: { found: [{ id: 'f1', name: 'poster_new', sizeBytes: 2048 }], gone: [] }
      }
    })
    const { baseElement } = render(
      <AppShell>
        <div>page</div>
      </AppShell>
    )
    expect(baseElement.querySelector('[data-slot="modal-layer"]')).toBeTruthy()
    expect(screen.getByText('poster_new')).toBeTruthy()
    expect(baseElement.querySelector('main')?.textContent).not.toContain('poster_new')
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

describe('AppShell details sidebar and pile page', () => {
  beforeEach(() => {
    useDetailsStore.getState().closePile()
    useDetailsStore.getState().syncTarget(null)
  })

  it('opens the sidebar surface when a mockup is shown, and widens the container when it closes', () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    )
    const aside = () => document.querySelector('[data-slot="aside"]')!
    expect(aside().getAttribute('data-open')).toBe('false')
    expect(document.querySelector('main')!.className).toContain('rounded-tr-none')
    act(() => useDetailsStore.getState().syncTarget(5))
    expect(aside().getAttribute('data-open')).toBe('true')
    expect(document.querySelector('main')!.className).toContain('rounded-tr-3xl')
    act(() => useDetailsStore.getState().syncTarget(null))
    expect(aside().getAttribute('data-open')).toBe('false')
  })

  it('shows the pile page header: breadcrumb back to My Stash, count and the Esc hint', () => {
    useDetailsStore
      .getState()
      .openPile({ id: 1, title: 'Clay iPhone', count: 4, select: 1, edit: false })
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    )
    const header = document.querySelector('[data-ds="PageHeader"]')!
    expect(header.textContent).toContain('Clay iPhone')
    expect(header.textContent).toContain('Pile · 4 mockups · Esc to go back')
    fireEvent.click(screen.getByRole('button', { name: 'My Stash', hidden: false }))
    expect(useDetailsStore.getState().pile).toBeNull()
  })

  it('keeps the dock and toasts left of the sidebar while it is open, and back in the corner after', async () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    )
    const dock = () => document.querySelector<HTMLElement>('[data-ds="ActivityDock"]')!
    expect(dock().style.right).toBe('16px')
    act(() => void sonnerToast('Pile made'))
    const toaster = () => document.querySelector<HTMLElement>('[data-sonner-toaster]')!
    await screen.findByText('Pile made')
    expect(toaster().style.getPropertyValue('--offset-right')).toBe('16px')

    act(() => useDetailsStore.getState().syncTarget(5))
    // 396 for the panel's share of the window, and the same 16px inset from the container's edge.
    expect(dock().style.right).toBe('412px')
    expect(toaster().style.getPropertyValue('--offset-right')).toBe('412px')
    expect(dock().style.transitionProperty).toBe('right')
    expect(dock().style.transitionDuration).toBe('var(--duration-panel-open)')

    act(() => useDetailsStore.getState().syncTarget(null))
    expect(dock().style.right).toBe('16px')
    expect(dock().style.transitionDuration).toBe('var(--duration-panel-container-close)')
    expect(toaster().style.getPropertyValue('--offset-right')).toBe('16px')
  })
})
