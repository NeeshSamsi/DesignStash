import { boardOrder, type BoardState } from './board-model'

// Moving around the Sort board by keyboard (F-046): ← and → step through the tiles in reading
// order, ↑ and ↓ go to the row above or below as the board is laid out. Pure: the board measures.

/**
 * The tile before or after `from` in reading order (each pile, then the tray). It stays put at
 * either end, starts on the first tile from nowhere, and is null on an empty board.
 */
export function stepTile(
  state: BoardState,
  from: number | null,
  direction: 'next' | 'previous'
): number | null {
  const order = boardOrder(state)
  if (order.length === 0) return null
  const at = from === null ? -1 : order.indexOf(from)
  if (at === -1) return order[0]!
  const next = at + (direction === 'next' ? 1 : -1)
  return order[Math.min(Math.max(next, 0), order.length - 1)]!
}

export interface TileBox {
  id: number
  rect: { left: number; top: number; width: number; height: number }
}

const centre = (rect: TileBox['rect']) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2
})

/** The tile in the nearest row above or below `from`, the closest across; null when there is none. */
export function nearestTile(
  tiles: readonly TileBox[],
  from: number,
  direction: 'up' | 'down'
): number | null {
  const here = tiles.find((t) => t.id === from)
  if (!here) return null
  const at = centre(here.rect)
  const half = here.rect.height / 2
  const sign = direction === 'down' ? 1 : -1
  const ahead = tiles.filter((t) => t.id !== from && (centre(t.rect).y - at.y) * sign > half)
  if (ahead.length === 0) return null
  const down = (t: TileBox) => Math.abs(centre(t.rect).y - at.y)
  const across = (t: TileBox) => Math.abs(centre(t.rect).x - at.x)
  const nearestRow = Math.min(...ahead.map(down))
  const row = ahead.filter((t) => down(t) - nearestRow < half)
  return row.reduce((best, t) => (across(t) < across(best) ? t : best)).id
}
