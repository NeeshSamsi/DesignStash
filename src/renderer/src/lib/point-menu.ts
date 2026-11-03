/** The menus' minimum width (min-w-60 in ui/dropdown-menu.tsx), in px. */
export const POINT_MENU_WIDTH = 240

/**
 * Where a menu opened at the pointer sits: to its right, or flipped to its left when it would run
 * past the window's right edge, as macOS menus do. Radix on its own only slides a menu that doesn't
 * fit back into the window. A menu wider than this still gets that slide.
 */
export function pointMenuAlign(x: number, windowWidth = window.innerWidth): 'start' | 'end' {
  return x + POINT_MENU_WIDTH > windowWidth && x >= POINT_MENU_WIDTH ? 'end' : 'start'
}
