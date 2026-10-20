/**
 * Fixed slots for the variant strip (design/specs/detail.md, V1a). Thumbnails sit on slots every 92px,
 * starting at the cover's left edge, so a thumbnail starts in the same place with or without scrolling.
 * All of this is whole-slot arithmetic; the pixel width comes from `w-variant-slot`.
 */
export const VARIANT_SLOT_PX = 92

/** Slots that fit under the 480px cover: 5 x 92 minus the last 8px gap. */
export const VISIBLE_SLOTS = 5

export type StripOverflow = 'fits' | 'start' | 'scrolled' | 'end'

/** The furthest the strip can scroll: the offset where the last variant sits in the last slot. */
export function maxOffset(count: number, visible = VISIBLE_SLOTS): number {
  return Math.max(0, count - visible)
}

export function clampOffset(offset: number, count: number, visible = VISIBLE_SLOTS): number {
  return Math.min(maxOffset(count, visible), Math.max(0, Math.round(offset)))
}

/** Which ends have more: 2 to 5 variants fit, and arrows only show where there is more. */
export function overflowState(
  offset: number,
  count: number,
  visible = VISIBLE_SLOTS
): StripOverflow {
  const max = maxOffset(count, visible)
  if (max === 0) return 'fits'
  const at = clampOffset(offset, count, visible)
  if (at === 0) return 'start'
  return at >= max ? 'end' : 'scrolled'
}

/** Where a drag or trackpad swipe of `deltaPx` (positive = content moved left) settles: always on a slot. */
export function settleOffset(
  offset: number,
  deltaPx: number,
  count: number,
  visible = VISIBLE_SLOTS
): number {
  return clampOffset(offset + deltaPx / VARIANT_SLOT_PX, count, visible)
}

/** The previous or next index, stopping at the ends. */
export function stepIndex(index: number, delta: -1 | 1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + delta))
}

/**
 * The offset that keeps the shown variant in a clear slot: the 2nd to 4th when both ends have more,
 * the 1st or 5th at an end with nothing beyond. Stepping onto a faded end scrolls exactly one slot.
 * Returns `offset` when the variant is already clear.
 */
export function offsetToShow(
  index: number,
  offset: number,
  count: number,
  visible = VISIBLE_SLOTS
): number {
  const max = maxOffset(count, visible)
  const at = clampOffset(offset, count, visible)
  const first = at > 0 ? at + 1 : at
  const last = at + visible - 1 - (at < max ? 1 : 0)
  if (index < first) return clampOffset(index - 1, count, visible)
  if (index > last) return clampOffset(index - (visible - 2), count, visible)
  return at
}
