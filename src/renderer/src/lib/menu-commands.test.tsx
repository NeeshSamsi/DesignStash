import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MenuCommand } from '@shared/ipc/menu'
import { useUiStore } from '@renderer/stores/uiStore'
import { runMenuCommand, useMenuCommands, type MenuActions } from './menu-commands'

const actions = (): MenuActions => ({
  addFiles: vi.fn(),
  addFolder: vi.fn(),
  focusSearch: vi.fn()
})

/** A modal dialog on screen, the way Radix draws one. */
function showModal(): () => void {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-slot', 'dialog-overlay')
  document.body.append(overlay)
  return () => overlay.remove()
}

beforeEach(() => {
  useUiStore.setState({
    view: 'all',
    settingsOpen: false,
    settingsSection: 'my-stash',
    updateCheckPending: false,
    reportOpen: false
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('runMenuCommand', () => {
  it('Settings… opens Settings on its first pane', () => {
    runMenuCommand('settings', actions())
    expect(useUiStore.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'my-stash' })
  })

  it.each(['about', 'check-updates'] as const)('%s opens Settings › About', (command) => {
    runMenuCommand(command, actions())
    expect(useUiStore.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'about' })
  })

  it('Check for Updates… leaves a check for About to run, once', () => {
    runMenuCommand('check-updates', actions())
    expect(useUiStore.getState().updateCheckPending).toBe(true)
    expect(useUiStore.getState().takeUpdateCheck()).toBe(true)
    expect(useUiStore.getState().takeUpdateCheck()).toBe(false)
  })

  it('Report a Problem… opens the report dialog over the page, without Settings', () => {
    runMenuCommand('report-problem', actions())
    expect(useUiStore.getState()).toMatchObject({ reportOpen: true, settingsOpen: false })
  })

  it('Add Files… and Add Folder… run the gather flow', () => {
    const a = actions()
    runMenuCommand('import-files', a)
    runMenuCommand('import-folder', a)
    expect(a.addFiles).toHaveBeenCalledOnce()
    expect(a.addFolder).toHaveBeenCalledOnce()
  })

  it('Search focuses the search field', () => {
    const a = actions()
    runMenuCommand('search', a)
    expect(a.focusSearch).toHaveBeenCalledOnce()
  })

  it.each([
    ['view:all', 'all'],
    ['view:starred', 'starred'],
    ['view:to-sort', 'to-sort'],
    ['view:to-stash', 'to-stash'],
    ['view:trash', 'trash']
  ] as const)('%s goes to that page', (command, view) => {
    useUiStore.setState({ view: view === 'all' ? 'trash' : 'all' })
    runMenuCommand(command, actions())
    expect(useUiStore.getState().view).toBe(view)
  })

  it('while Settings is open, the Settings items switch its pane', () => {
    useUiStore.setState({ settingsOpen: true, settingsSection: 'tags' })
    const hide = showModal()
    runMenuCommand('about', actions())
    expect(useUiStore.getState().settingsSection).toBe('about')
    hide()
  })

  it.each(['search', 'import-files', 'view:trash'] as const)(
    'while Settings is open, %s does nothing',
    (command: MenuCommand) => {
      useUiStore.setState({ settingsOpen: true })
      const hide = showModal()
      const a = actions()
      runMenuCommand(command, a)
      expect(a.focusSearch).not.toHaveBeenCalled()
      expect(a.addFiles).not.toHaveBeenCalled()
      expect(useUiStore.getState().view).toBe('all')
      hide()
    }
  )

  it('while another dialog is open, nothing runs, not even Settings', () => {
    const hide = showModal()
    const a = actions()
    for (const command of [
      'settings',
      'about',
      'report-problem',
      'import-files',
      'view:trash'
    ] as const) {
      runMenuCommand(command, a)
    }
    expect(useUiStore.getState()).toMatchObject({
      settingsOpen: false,
      reportOpen: false,
      view: 'all'
    })
    expect(a.addFiles).not.toHaveBeenCalled()
    hide()
  })
})

describe('useMenuCommands', () => {
  let relay: (payload: unknown) => void
  const off = vi.fn()

  beforeEach(() => {
    off.mockClear()
    window.api = {
      subscribe: vi.fn((_channel: string, cb: (payload: unknown) => void) => {
        relay = cb
        return off
      })
    } as unknown as typeof window.api
  })

  it('runs each menu:command push with the latest actions, and stops on unmount', () => {
    const first = actions()
    const second = actions()
    const { rerender, unmount } = renderHook((a: MenuActions) => useMenuCommands(a), {
      initialProps: first
    })
    expect(window.api.subscribe).toHaveBeenCalledWith(
      IPC_CHANNELS.MENU_COMMAND,
      expect.any(Function)
    )
    rerender(second)
    relay('import-files')
    expect(first.addFiles).not.toHaveBeenCalled()
    expect(second.addFiles).toHaveBeenCalledOnce()
    unmount()
    expect(off).toHaveBeenCalledOnce()
  })

  it('ignores a payload that is not a command', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderHook(() => useMenuCommands(actions()))
    relay('format-disk')
    expect(useUiStore.getState().settingsOpen).toBe(false)
    err.mockRestore()
  })
})
