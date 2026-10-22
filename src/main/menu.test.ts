import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({ Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() } }))

import { GUIDE_URL, buildMenuTemplate, type MenuDeps } from './menu'

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
      'editMenu',
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

  it('the View items have no shortcut yet (⌘F and ⌘1 to ⌘5 wait on Neesh)', () => {
    const { template } = setup()
    for (const label of ['Search', 'My Stash', 'Starred', 'To sort', 'To stash', 'Trash']) {
      expect(find(template, 'View', label).accelerator).toBeUndefined()
    }
  })

  it('leaves every app shortcut to the window, so a key never fires twice', () => {
    const { template } = setup()
    const custom = template.flatMap((m) => submenu(m)).filter((i) => i.click && i.accelerator)
    expect(custom.length).toBeGreaterThan(0)
    for (const item of custom) expect(item.registerAccelerator).toBe(false)
  })

  it('Edit and Window are the standard menus', () => {
    const { template } = setup()
    expect(template[2]!.role).toBe('editMenu')
    expect(template[4]!.role).toBe('windowMenu')
  })

  it('Help › DesignStash Guide opens the guide in the browser', () => {
    const { deps, template } = setup()
    click(find(template, 'Help', 'DesignStash Guide'))
    expect(deps.openExternal).toHaveBeenCalledWith(GUIDE_URL)
    expect(deps.send).not.toHaveBeenCalled()
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
