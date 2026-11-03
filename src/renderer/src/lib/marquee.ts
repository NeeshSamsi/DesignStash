export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface HitTarget {
  id: string
  rect: Rect
}

/** The box dragged between two points, whichever corner the drag started from. */
export function marqueeRect(from: Point, to: Point): Rect {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    right: Math.max(from.x, to.x),
    bottom: Math.max(from.y, to.y)
  }
}

/** True when the rectangles overlap; edges that only touch do not count. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** Ids of every target the box touches, in the order the targets were given (grid order). */
export function marqueeHits(box: Rect, targets: readonly HitTarget[]): string[] {
  return targets.filter((target) => rectsIntersect(box, target.rect)).map((target) => target.id)
}

/** Whether a drag has moved far enough to count as a marquee rather than a click. */
export function exceedsDragThreshold(from: Point, to: Point, threshold = 4): boolean {
  return Math.abs(to.x - from.x) >= threshold || Math.abs(to.y - from.y) >= threshold
}
