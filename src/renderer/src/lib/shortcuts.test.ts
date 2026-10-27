import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  SHORTCUT_BOUNDARY_ATTR,
  SHORTCUT_SCOPE_ATTR,
  ShortcutRegistry,
  comboFromEvent,
  normaliseCombo,
  useShortcut
} from './shortcuts'

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('combos', () => {
  it('normalises modifier order, case and aliases', () => {
    expect(normaliseCombo('Shift+Mod+O')).toBe('mod+shift+o')
    expect(normaliseCombo('cmd+shift+o')).toBe('mod+shift+o')
    expect(normaliseCombo('Esc')).toBe('escape')
  })

  it('reads a combo from an event', () => {
    expect(
      comboFromEvent(new KeyboardEvent('keydown', { key: 'O', metaKey: true, shiftKey: true }))
    ).toBe('mod+shift+o')
  })
})

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry
  beforeEach(() => {
    registry = new ShortcutRegistry()
    registry.install()
  })

  it('refuses a duplicate binding in the same scope, however it is spelled', () => {
    registry.register({ id: 'a', combo: 'mod+shift+o', handler: vi.fn() })
    expect(() => registry.register({ id: 'b', combo: 'shift+cmd+O', handler: vi.fn() })).toThrow(
      /already bound in "global" by "a"/
    )
  })

  it('lets the same combo live in different scopes', () => {
    registry.register({ id: 'a', combo: 'mod+g', handler: vi.fn() })
    expect(() =>
      registry.register({ id: 'b', combo: 'mod+g', scope: 'grid', handler: vi.fn() })
    ).not.toThrow()
  })

  it('frees the combo when unregistered', () => {
    const off = registry.register({ id: 'a', combo: 'mod+g', handler: vi.fn() })
    off()
    expect(() => registry.register({ id: 'b', combo: 'mod+g', handler: vi.fn() })).not.toThrow()
  })

  it('fires a global binding from anywhere', () => {
    const handler = vi.fn()
    registry.register({ id: 'open', combo: 'mod+o', handler })
    const event = press({ key: 'o', metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('fires a scoped binding only while focus is inside the scope', () => {
    const handler = vi.fn()
    registry.register({ id: 'grid.all', combo: 'mod+a', scope: 'grid', handler })
    const grid = document.createElement('div')
    grid.setAttribute(SHORTCUT_SCOPE_ATTR, 'grid')
    const cell = document.createElement('button')
    grid.append(cell)
    document.body.append(grid)

    press({ key: 'a', metaKey: true })
    expect(handler).not.toHaveBeenCalled()
    press({ key: 'a', metaKey: true }, cell)
    expect(handler).toHaveBeenCalledTimes(1)
    grid.remove()
  })

  it('a scoped binding beats the global one with the same combo', () => {
    const global = vi.fn()
    const scoped = vi.fn()
    registry.register({ id: 'g', combo: 'mod+a', handler: global })
    registry.register({ id: 's', combo: 'mod+a', scope: 'grid', handler: scoped })
    const grid = document.createElement('div')
    grid.setAttribute(SHORTCUT_SCOPE_ATTR, 'grid')
    document.body.append(grid)

    press({ key: 'a', metaKey: true }, grid)
    expect(scoped).toHaveBeenCalledTimes(1)
    expect(global).not.toHaveBeenCalled()
    press({ key: 'a', metaKey: true })
    expect(global).toHaveBeenCalledTimes(1)
    grid.remove()
  })

  it('ignores plain keys while typing but not ⌘ combos', () => {
    const plain = vi.fn()
    const mod = vi.fn()
    registry.register({ id: 'p', combo: 'g', handler: plain })
    registry.register({ id: 'm', combo: 'mod+g', handler: mod })
    const input = document.createElement('input')
    document.body.append(input)

    press({ key: 'g' }, input)
    press({ key: 'g', metaKey: true }, input)
    expect(plain).not.toHaveBeenCalled()
    expect(mod).toHaveBeenCalledTimes(1)
    press({ key: 'g' })
    expect(plain).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('a reserved combo blocks duplicates but leaves the key to its owner', () => {
    registry.register({ id: 'search.focus', combo: 'mod+k' })
    expect(() => registry.register({ id: 'other', combo: 'mod+k', handler: vi.fn() })).toThrow()
    const event = press({ key: 'k', metaKey: true })
    expect(event.defaultPrevented).toBe(false)
  })

  describe('a scope boundary (a modal dialog)', () => {
    /** `<div boundary><div scope="sort"><button/></div></div>`, in the page. */
    function modal() {
      const frame = document.createElement('div')
      frame.setAttribute(SHORTCUT_BOUNDARY_ATTR, '')
      const board = document.createElement('div')
      board.setAttribute(SHORTCUT_SCOPE_ATTR, 'sort')
      const button = document.createElement('button')
      board.append(button)
      frame.append(board)
      document.body.append(frame)
      return { frame, button }
    }

    it('stops global shortcuts from inside it, and keeps its own scoped ones', () => {
      const open = vi.fn()
      const undo = vi.fn()
      registry.register({ id: 'import.add-files', combo: 'mod+o', handler: open })
      registry.register({ id: 'sort.undo', combo: 'mod+z', scope: 'sort', handler: undo })
      const { frame, button } = modal()
      const event = press({ key: 'o', metaKey: true }, button)
      expect(open).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
      press({ key: 'z', metaKey: true }, button)
      expect(undo).toHaveBeenCalledTimes(1)
      frame.remove()
    })

    it('stops global shortcuts while it is open, from a menu that sits outside it too', () => {
      const open = vi.fn()
      registry.register({ id: 'import.add-files', combo: 'mod+o', handler: open })
      const { frame } = modal()
      const menu = document.createElement('div')
      document.body.append(menu)
      press({ key: 'o', metaKey: true }, menu)
      expect(open).not.toHaveBeenCalled()
      frame.remove()
      press({ key: 'o', metaKey: true }, menu)
      expect(open).toHaveBeenCalledTimes(1)
      menu.remove()
    })
  })

  it('lists what is bound', () => {
    registry.register({ id: 'a', combo: 'Shift+Cmd+O', handler: vi.fn() })
    expect(registry.list()).toEqual([{ id: 'a', combo: 'mod+shift+o', scope: 'global' }])
  })
})

describe('useShortcut', () => {
  it('binds while mounted and releases on unmount', () => {
    const registry = new ShortcutRegistry()
    registry.install()
    const handler = vi.fn()
    const { unmount } = renderHook(() =>
      useShortcut({ id: 'a', combo: 'mod+o', handler }, registry)
    )
    press({ key: 'o', metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    unmount()
    press({ key: 'o', metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(registry.list()).toEqual([])
  })

  it('always runs the latest handler without rebinding', () => {
    const registry = new ShortcutRegistry()
    registry.install()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ handler }) => useShortcut({ id: 'a', combo: 'mod+o', handler }, registry),
      {
        initialProps: { handler: first }
      }
    )
    rerender({ handler: second })
    press({ key: 'o', metaKey: true })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('two components cannot claim one combo', () => {
    const registry = new ShortcutRegistry()
    renderHook(() => useShortcut({ id: 'a', combo: 'mod+o', handler: vi.fn() }, registry))
    expect(() =>
      renderHook(() => useShortcut({ id: 'b', combo: 'mod+o', handler: vi.fn() }, registry))
    ).toThrow(/already bound/)
  })
})
