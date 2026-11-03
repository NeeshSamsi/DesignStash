import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({ Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() } }))

import { GUIDE_URL, buildMenuTemplate, undoMenuItems, type MenuDeps } from './menu'

const GUIDE = 'https://example.com/guide'

function setup(): { deps: MenuDeps; template: MenuItemConstructorOptions[] } {
  const deps: MenuDeps = { send: vi.fn(), openExternal: vi.fn() }
  return { deps, template: buildMenuTemplate(deps) }
}

const submenu = (item: MenuItemConstructorOptions): MenuItemConstructorOptions[] =>
  (item.submenu as MenuItemConstructorOptions[] | undefined) ?? []

const find = (template: MenuItemConstructorOptions[], top: string, label: string) => {
  const menu = template.find((m) => m.label === top)
  const item = menu && submenu(menu).find((i) => i.label === label)
  if (!item) throw new Error(`No ${top} › ${label}`)
  return item
}

const click = (item: MenuItemConstructorOptions): void => {
  ;(item.click as () => void)()
}

describe('buildMenuTemplate', () => {
  it('has the six macOS menus in order', () => {
    const { template } = setup()
    expect(template.map((m) => m.label ?? m.role)).toEqual([
      'DesignStash',
      'File',
      'Edit',
      'View',
      'windowMenu',
      'Help'
    ])
  })

  it('the app menu runs About, Settings, Check for Updates, then the standard Hide and Quit', () => {
    const { template } = setup()
    const items = submenu(template[0]!).map((i) => i.label ?? i.role ?? i.type)
    expect(items).toEqual([
      'About DesignStash',
      'separator',
      'Settings…',
      'Check for Updates…',
      'separator',
      'hide',
      'hideOthers',
      'unhide',
      'separator',
      'quit'
    ])
  })

  it.each([
    ['DesignStash', 'About DesignStash', 'about'],
    ['DesignStash', 'Settings…', 'settings'],
    ['DesignStash', 'Check for Updates…', 'check-updates'],
    ['File', 'Add Files…', 'import-files'],
    ['File', 'Add Folder…', 'import-folder'],
    ['View', 'Search', 'search'],
    ['View', 'My Stash', 'view:all'],
    ['View', 'Starred', 'view:starred'],
    ['View', 'To sort', 'view:to-sort'],
    ['View', 'To stash', 'view:to-stash'],
    ['View', 'Trash', 'view:trash'],
    ['Help', 'Report a Problem…', 'report-problem']
  ] as const)('%s › %s sends %s to the window', (top, label, command) => {
    const { deps, template } = setup()
    click(find(template, top, label))
    expect(deps.send).toHaveBeenCalledWith(command)
  })

  it('shows the app’s own shortcuts', () => {
    const { template } = setup()
    expect(find(template, 'DesignStash', 'Settings…').accelerator).toBe('CmdOrCtrl+,')
    expect(find(template, 'File', 'Add Files…').accelerator).toBe('CmdOrCtrl+O')
    expect(find(template, 'File', 'Add Folder…').accelerator).toBe('CmdOrCtrl+Shift+O')
  })

  it('View shows ⌘F for Search, and the pages have no shortcut', () => {
    const { template } = setup()
    expect(find(template, 'View', 'Search').accelerator).toBe('CmdOrCtrl+F')
    for (const label of ['My Stash', 'Starred', 'To sort', 'To stash', 'Trash']) {
      expect(find(template, 'View', label).accelerator).toBeUndefined()
    }
  })

  it('leaves every app shortcut but Undo and Redo to the window, so a key never fires twice', () => {
    const { template } = setup()
    const custom = template
      .flatMap((m) => submenu(m))
      .filter((i) => i.click && i.accelerator && i.label !== 'Undo' && i.label !== 'Redo')
    expect(custom.length).toBeGreaterThan(0)
    for (const item of custom) expect(item.registerAccelerator).toBe(false)
  })

  it('Edit starts with Undo and Redo, then the standard text items; Window is the standard menu', () => {
    const { template } = setup()
    expect(submenu(template[2]!).map((i) => i.label ?? i.role ?? i.type)).toEqual([
      'Undo',
      'Redo',
      'separator',
      'cut',
      'copy',
      'paste',
      'pasteAndMatchStyle',
      'delete',
      'selectAll'
    ])
    expect(template[4]!.role).toBe('windowMenu')
  })

  it('Undo and Redo own ⌘Z and ⇧⌘Z, and send undo and redo to the window', () => {
    const { deps, template } = setup()
    const undo = find(template, 'Edit', 'Undo')
    const redo = find(template, 'Edit', 'Redo')
    // Registered with the menu, so the key reaches the window as a command, even in a dialog.
    expect([undo.accelerator, undo.registerAccelerator]).toEqual(['CmdOrCtrl+Z', undefined])
    expect([redo.accelerator, redo.registerAccelerator]).toEqual(['Shift+CmdOrCtrl+Z', undefined])
    click(undo)
    click(redo)
    expect(deps.send).toHaveBeenNthCalledWith(1, 'undo')
    expect(deps.send).toHaveBeenNthCalledWith(2, 'redo')
  })

  it('names Undo and Redo as the history says', () => {
    const deps: MenuDeps = {
      send: vi.fn(),
      openExternal: vi.fn(),
      undo: {
        undo: { label: 'Undo Move to Trash', enabled: true },
        redo: { label: 'Redo', enabled: false }
      }
    }
    const template = buildMenuTemplate(deps)
    expect(find(template, 'Edit', 'Undo Move to Trash').enabled).toBe(true)
    expect(find(template, 'Edit', 'Redo').enabled).toBe(false)
  })

  it('Help › DesignStash Guide opens the guide in the browser', () => {
    const deps: MenuDeps = { send: vi.fn(), openExternal: vi.fn(), guideUrl: GUIDE }
    click(find(buildMenuTemplate(deps), 'Help', 'DesignStash Guide'))
    expect(deps.openExternal).toHaveBeenCalledWith(GUIDE)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('has no Guide item while there is no guide to open', () => {
    expect(GUIDE_URL).toBeNull()
    const help = setup().template.find((m) => m.label === 'Help')!
    expect(submenu(help).map((i) => i.label)).toEqual(['Report a Problem…'])
  })

  it('only offers the dev tools in development', () => {
    const roles = (t: MenuItemConstructorOptions[]) =>
      submenu(t.find((m) => m.label === 'View')!).map((i) => i.role)
    expect(roles(setup().template)).not.toContain('toggleDevTools')
    const dev = buildMenuTemplate({ send: vi.fn(), openExternal: vi.fn(), dev: true })
    expect(roles(dev)).toContain('toggleDevTools')
    expect(roles(dev)).toContain('reload')
  })
})

describe('undoMenuItems', () => {
  const entry = (label: string, reversal = false) => ({ label, reversal })

  it('names the app’s next undo and redo', () => {
    expect(
      undoMenuItems('app', { undo: entry('Move to Trash'), redo: entry('Disband pile') })
    ).toEqual({
      undo: { label: 'Undo Move to Trash', enabled: true },
      redo: { label: 'Redo Disband pile', enabled: true }
    })
  })

  it('is plain and disabled when there is nothing to undo or redo', () => {
    expect(undoMenuItems('app', { undo: null, redo: null })).toEqual({
      undo: { label: 'Undo', enabled: false },
      redo: { label: 'Redo', enabled: false }
    })
  })

  it('reads plain Undo and Redo in a field or a flow, which keep their own steps', () => {
    for (const context of ['field', 'flow'] as const) {
      expect(undoMenuItems(context, { undo: entry('Move to Trash'), redo: null })).toEqual({
        undo: { label: 'Undo', enabled: true },
        redo: { label: 'Redo', enabled: true }
      })
    }
  })

  it('reads plain Undo for a toast’s out-of-order undo, where ⌘Z puts things back', () => {
    expect(undoMenuItems('app', { undo: entry('Move to Trash', true), redo: null }).undo).toEqual({
      label: 'Undo',
      enabled: true
    })
  })
})
