import { useEffect, useRef } from 'react'

/** Elements that mark a focus scope: `<div data-shortcut-scope="grid">`. */
export const SHORTCUT_SCOPE_ATTR = 'data-shortcut-scope'
/**
 * Marks a modal (every live DialogFrame): its own scopes still work inside it, but the window's
 * global shortcuts stay behind it while it is open, as a click can't reach what it covers.
 */
export const SHORTCUT_BOUNDARY_ATTR = 'data-shortcut-scope-boundary'
export const GLOBAL_SCOPE = 'global'

export interface ShortcutDef {
  /** Unique name, shown in errors and `list()`. */
  id: string
  /** `mod+k`, `mod+shift+o`, `escape`. `mod` is ⌘ (the app is macOS only). */
  combo: string
  /** `global`, or the value of a `data-shortcut-scope` ancestor of the focused element. */
  scope?: string
  /**
   * Runs the shortcut. Leave it out to reserve a combo that another listener already handles
   * (GlobalSearch's ⌘K): the registry then blocks duplicates but does not act on it.
   */
  handler?: (event: KeyboardEvent) => void
}

interface Binding extends ShortcutDef {
  scope: string
  key: string
}

const MODIFIER_ORDER = ['alt', 'ctrl', 'mod', 'shift'] as const
const ALIASES: Record<string, string> = {
  cmd: 'mod',
  meta: 'mod',
  command: 'mod',
  option: 'alt',
  esc: 'escape'
}

/** `Shift+Mod+O` and `mod+shift+o` are the same binding. */
export function normaliseCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => ALIASES[p.trim()] ?? p.trim())
  const key = parts.filter((p) => !(MODIFIER_ORDER as readonly string[]).includes(p)).at(-1)
  if (!key) throw new Error(`Shortcut "${combo}" has no key`)
  const mods = MODIFIER_ORDER.filter((m) => parts.includes(m))
  return [...mods, key].join('+')
}

export function comboFromEvent(event: KeyboardEvent): string {
  const mods = MODIFIER_ORDER.filter(
    (m) =>
      (m === 'alt' && event.altKey) ||
      (m === 'ctrl' && event.ctrlKey) ||
      (m === 'mod' && event.metaKey) ||
      (m === 'shift' && event.shiftKey)
  )
  return [...mods, event.key.toLowerCase()].join('+')
}

/**
 * Scopes from the focused element outwards, ending with `global`. A boundary ends the chain there,
 * and while one is open anywhere (focus can sit in a menu portalled outside it) `global` is left out.
 */
function scopeChain(target: EventTarget | null): string[] {
  const chain: string[] = []
  let el = target instanceof Element ? target : null
  while (el) {
    const scope = el.getAttribute(SHORTCUT_SCOPE_ATTR)
    if (scope) chain.push(scope)
    if (el.hasAttribute(SHORTCUT_BOUNDARY_ATTR)) return chain
    el = el.parentElement
  }
  if (document.querySelector(`[${SHORTCUT_BOUNDARY_ATTR}]`) === null) chain.push(GLOBAL_SCOPE)
  return chain
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * One place for every keyboard shortcut. A combo can be bound once per scope, so two features
 * cannot claim the same keys; registering a second binding throws. A scoped binding only fires
 * while focus is inside that scope, and beats the global one with the same combo. Global ones
 * don't fire while a modal (a scope boundary) is open.
 * Plain keys (no ⌘, ⌃ or ⌥) are ignored while typing in a field.
 */
export class ShortcutRegistry {
  private bindings = new Map<string, Binding>()

  register(def: ShortcutDef): () => void {
    const scope = def.scope ?? GLOBAL_SCOPE
    const key = `${scope}:${normaliseCombo(def.combo)}`
    const existing = this.bindings.get(key)
    if (existing) {
      throw new Error(`Shortcut ${def.combo} is already bound in "${scope}" by "${existing.id}"`)
    }
    const binding: Binding = { ...def, scope, key }
    this.bindings.set(key, binding)
    return () => {
      if (this.bindings.get(key) === binding) this.bindings.delete(key)
    }
  }

  /** Returns true when a binding claimed the event. */
  dispatch(event: KeyboardEvent): boolean {
    const combo = comboFromEvent(event)
    const plain = !/(^|\+)(alt|ctrl|mod)\+/.test(combo)
    if (plain && isTyping(event.target)) return false
    for (const scope of scopeChain(event.target)) {
      const binding = this.bindings.get(`${scope}:${combo}`)
      if (!binding) continue
      if (binding.handler) {
        event.preventDefault()
        binding.handler(event)
      }
      return true
    }
    return false
  }

  list(): { id: string; combo: string; scope: string }[] {
    return [...this.bindings.values()].map(({ id, combo, scope }) => ({
      id,
      combo: normaliseCombo(combo),
      scope
    }))
  }

  /** Listens for keydown on `target`. Returns the remover. */
  install(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
    const onKeyDown = (event: KeyboardEvent) => void this.dispatch(event)
    target.addEventListener('keydown', onKeyDown as EventListener)
    return () => target.removeEventListener('keydown', onKeyDown as EventListener)
  }
}

export const shortcuts = new ShortcutRegistry()

/** Mount once, at the top of the app. */
export function useShortcutDispatcher(registry: ShortcutRegistry = shortcuts) {
  useEffect(() => registry.install(), [registry])
}

/** Bind a shortcut for as long as the component is mounted. */
export function useShortcut(def: ShortcutDef, registry: ShortcutRegistry = shortcuts) {
  const handler = useRef(def.handler)
  useEffect(() => {
    handler.current = def.handler
  })
  const { id, combo, scope } = def
  const reserved = def.handler === undefined
  useEffect(
    () =>
      registry.register({
        id,
        combo,
        ...(scope !== undefined ? { scope } : {}),
        ...(reserved ? {} : { handler: (event: KeyboardEvent) => handler.current?.(event) })
      }),
    [registry, id, combo, scope, reserved]
  )
}
