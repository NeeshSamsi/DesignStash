import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Grids this big mount only the rows near the view. Smaller ones mount every card, as they always have. */
export const WINDOW_FROM = 200

/** Cells mounted before the grid is measured; where nothing lays out (jsdom) it stays at this. */
export const FIRST_CELLS = 60

/** Read from the grid as laid out: columns from its tracks, one row plus its gap, and its width. */
export interface CardLayout {
  columns: number
  pitch: number
  gap: number
  width: number
}

/** The rows to mount, first and last included. */
export interface RowSpan {
  start: number
  end: number
}

/** A run of cells to mount, or one block standing in for the rows that are not. */
export type WindowPart =
  | { kind: 'cells'; from: number; to: number }
  | { kind: 'rows'; key: string; height: number }

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

/** Spacers carry this, so measuring and hit-testing skip them. */
export const SPACER_ATTR = 'data-grid-rows'

/**
 * Which cells to mount: the rows in `span`, plus the row holding `pinned` (the selection cursor, so
 * arrow keys and Reveal always find its card). The rows between are blocks of the same height, so
 * the scroll height and position hold. Before the grid is measured, the first cells only.
 */
export function windowParts(
  cellCount: number,
  layout: CardLayout | null,
  span: RowSpan | null,
  pinned: number | null
): WindowPart[] {
  if (!layout || !span) return [{ kind: 'cells', from: 0, to: Math.min(cellCount, FIRST_CELLS) }]
  const rows = Math.ceil(cellCount / layout.columns)
  if (rows === 0) return []
  const start = clamp(span.start, 0, rows - 1)
  const end = clamp(span.end, start, rows - 1)
  const runs: RowSpan[] = [{ start, end }]
  if (pinned !== null && pinned >= 0 && pinned < cellCount) {
    const row = Math.floor(pinned / layout.columns)
    if (row < start) runs.unshift({ start: row, end: row })
    if (row > end) runs.push({ start: row, end: row })
  }

  const parts: WindowPart[] = []
  const block = (from: number, to: number) => {
    // A block is one grid row; the grid's own gap follows it, so it stands for n rows less one gap.
    if (to > from)
      parts.push({
        kind: 'rows',
        key: `rows-${parts.length}`,
        height: (to - from) * layout.pitch - layout.gap
      })
  }
  let next = 0
  for (const run of runs) {
    block(next, run.start)
    parts.push({
      kind: 'cells',
      from: run.start * layout.columns,
      to: Math.min(cellCount, (run.end + 1) * layout.columns)
    })
    next = run.end + 1
  }
  block(next, rows)
  return parts
}

/** The grid's column tracks as laid out, or 0 where nothing lays out. */
export function trackCount(list: Element): number {
  const tracks = getComputedStyle(list).gridTemplateColumns as string | undefined
  return (tracks ?? '').split(' ').filter((track) => track !== '' && track !== 'none').length
}

/**
 * The grid's layout. The row is the tallest card mounted; a pile's edges hang in its margin, which
 * is left out, so a row of piles runs a little taller and the view is never short of rows. While
 * the width and columns hold, the row only ever grows: a height that changed with whichever rows
 * are mounted would move the span, which would change the height again.
 */
function measure(list: HTMLElement, previous: CardLayout | null): CardLayout | null {
  const columns = trackCount(list)
  if (columns < 1) return null
  const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0
  const width = list.clientWidth
  const cells = Array.from(list.children).filter((el) => !el.hasAttribute(SPACER_ATTR))
  const cards = cells.filter((el) => el.hasAttribute('data-mockup-id'))
  const height = Math.max(
    0,
    ...(cards.length > 0 ? cards : cells).map((el) => el.getBoundingClientRect().height)
  )
  if (height <= 0) return null
  const pitch =
    previous && previous.columns === columns && previous.width === width
      ? Math.max(previous.pitch, height + gap)
      : height + gap
  return { columns, pitch, gap, width }
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
  }
  return null
}

interface View {
  /** The view's top and bottom, in the window's coordinates. */
  top: number
  bottom: number
  /** Where the view's top falls in the list, from the list's top. */
  offset: number
}

function viewOf(list: HTMLElement): View {
  const scroller = scrollParent(list)
  const top = scroller ? scroller.getBoundingClientRect().top : 0
  const height = scroller ? scroller.clientHeight : window.innerHeight
  return { top, bottom: top + height, offset: top - list.getBoundingClientRect().top }
}

/** The rows on screen, and how many rows a screen holds. */
function viewRows(view: View, layout: CardLayout, rows: number): RowSpan & { screen: number } {
  const last = Math.max(0, rows - 1)
  return {
    start: clamp(Math.floor(view.offset / layout.pitch), 0, last),
    end: clamp(Math.floor((view.offset + view.bottom - view.top) / layout.pitch), 0, last),
    screen: Math.ceil((view.bottom - view.top) / layout.pitch)
  }
}

/** The first card on screen and how far below the view's top it sits. */
interface Anchor {
  mockupId: string
  offset: number
}

function firstOnScreen(list: HTMLElement, view: View): Anchor | null {
  for (const card of list.querySelectorAll<HTMLElement>(':scope > [data-mockup-id]')) {
    const box = card.getBoundingClientRect()
    if (box.bottom > view.top && box.top < view.bottom)
      return { mockupId: card.dataset.mockupId ?? '', offset: box.top - view.top }
  }
  return null
}

/** Scrolls so the anchor card sits where it was on screen; nothing when it is not mounted. */
function settle(list: HTMLElement, anchor: Anchor): void {
  const card = Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-mockup-id]')).find(
    (el) => el.dataset.mockupId === anchor.mockupId
  )
  const scroller = scrollParent(list) ?? document.scrollingElement
  if (!card || !scroller) return
  const drift = card.getBoundingClientRect().top - viewOf(list).top - anchor.offset
  if (Math.abs(drift) >= 1) scroller.scrollTop += drift
}

/**
 * The rows on screen after a reflow, kept around the card that was first on screen before it.
 * It stays mounted and is put back where it was, so the view keeps its place, as the browser's
 * scroll anchoring does for a grid with every card mounted. (The browser does not follow it here:
 * the blocks that stand in for rows change in the same frame.)
 */
function anchoredRows(
  anchor: Anchor,
  view: View,
  layout: CardLayout,
  rows: number,
  cellOf: (mockupId: string) => number | undefined
): (RowSpan & { screen: number }) | null {
  const cell = cellOf(anchor.mockupId)
  if (cell === undefined) return null
  const screen = Math.ceil((view.bottom - view.top) / layout.pitch)
  const row = Math.min(rows - 1, Math.floor(cell / layout.columns))
  const above = Math.max(0, Math.floor(anchor.offset / layout.pitch))
  return { start: Math.max(0, row - above), end: Math.min(rows - 1, row + screen), screen }
}

/**
 * The rows to mount for this view. The span holds while every row on screen is in it, and only
 * then moves, to a screen either side. Mounting rows lets scroll anchoring nudge the view by the
 * few pixels a pile's edges add to a row; a span that followed every nudge would flip between two
 * spans without end.
 */
export function nextSpan(
  current: RowSpan | null,
  view: RowSpan & { screen: number },
  rows: number
): RowSpan {
  const last = Math.max(0, rows - 1)
  if (current && current.start <= view.start && view.end <= current.end && current.end <= last)
    return current
  return {
    start: clamp(view.start - view.screen, 0, last),
    end: clamp(view.end + view.screen, 0, last)
  }
}

const sameLayout = (a: CardLayout | null, b: CardLayout | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.columns === b.columns &&
    Math.abs(a.pitch - b.pitch) < 0.5 &&
    a.gap === b.gap &&
    a.width === b.width)

const sameSpan = (a: RowSpan | null, b: RowSpan | null) =>
  a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end)

/**
 * Mounts only the rows of a big card grid that are on screen or near it (F-071: 3,416 cards took
 * 1.3 s to show their first cover). Returns null when every cell should mount. `listRef` is the
 * element with the grid tracks; it scrolls with its nearest scrolling ancestor.
 */
export function useCardWindow(
  listRef: RefObject<HTMLElement | null>,
  cellCount: number,
  enabled: boolean,
  pinned: number | null,
  cellOf: (mockupId: string) => number | undefined
): WindowPart[] | null {
  const active = enabled && cellCount >= WINDOW_FROM
  const [state, setState] = useState<{ layout: CardLayout | null; span: RowSpan | null }>({
    layout: null,
    span: null
  })

  // Measure after every commit: a new search, a resize or the sidebar can change the columns, the
  // row height or how many rows there are. Only a real change renders again, and before paint.
  const update = useRef<() => void>(() => {})
  const anchor = useRef<Anchor | null>(null)
  const reflowAnchor = useRef<Anchor | null>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    update.current = () => {
      if (!active || !list) {
        // A grid that windows again later starts from what is on screen then.
        anchor.current = null
        reflowAnchor.current = null
        return
      }
      // The commit after a reflow: the anchor card is mounted again, so put it back.
      if (reflowAnchor.current) {
        settle(list, reflowAnchor.current)
        reflowAnchor.current = null
      }
      const layout = measure(list, state.layout)
      if (!layout) {
        if (state.layout || state.span) setState({ layout: null, span: null })
        return
      }
      const rows = Math.ceil(cellCount / layout.columns)
      const view = viewOf(list)
      const reflowed = !sameLayout(state.layout, layout)
      // New columns or row height put every card somewhere else: start the span afresh, around
      // the card that was on screen when there was one.
      const before = state.layout && anchor.current
      const span = reflowed
        ? nextSpan(
            null,
            (before && anchoredRows(before, view, layout, rows, cellOf)) ||
              viewRows(view, layout, rows),
            rows
          )
        : nextSpan(state.span, viewRows(view, layout, rows), rows)
      // Remembered while the layout holds; after a reflow it is put back on the next commit.
      if (reflowed && before) reflowAnchor.current = before
      anchor.current = reflowed ? null : firstOnScreen(list, view)
      if (reflowed || !sameSpan(state.span, span)) setState({ layout, span })
    }
    update.current()
  })

  // Scrolling and resizing move the view: look again, at most once a frame.
  useEffect(() => {
    const list = listRef.current
    if (!active || !list) return
    let frame: number | null = null
    const schedule = () => {
      frame ??= requestAnimationFrame(() => {
        frame = null
        update.current()
      })
    }
    const scroller = scrollParent(list) ?? window
    scroller.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(list)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [active, listRef])

  if (!active) return null
  return windowParts(cellCount, state.layout, state.span, pinned)
}
