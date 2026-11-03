import { vi } from 'vitest'

// jsdom lacks several DOM APIs that shadcn/Radix primitives (Sidebar, Select,
// DropdownMenu, Dialog) rely on. Polyfill them for the renderer test environment.

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

if (!('ResizeObserver' in window)) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

Element.prototype.scrollIntoView ??= vi.fn()
Element.prototype.hasPointerCapture ??= vi.fn(() => false)
Element.prototype.releasePointerCapture ??= vi.fn()
