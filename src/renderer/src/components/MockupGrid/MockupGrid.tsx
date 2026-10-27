import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import { AddMockupCard } from '@renderer/components/AddMockupCard'
import { MockupCard } from '@renderer/components/MockupCard'
import type { Direction, GridSelection } from '@renderer/hooks/use-grid-selection'
import {
  exceedsDragThreshold,
  marqueeHits,
  marqueeRect,
  type HitTarget,
  type Point,
  type Rect
} from '@renderer/lib/marquee'
import { cn } from '@renderer/lib/utils'
import { GridCardContext, type GridCard } from './grid-card'
import { trackCount, useCardWindow, WINDOW_FROM } from './use-card-window'
import { MOCKUP_GRID_DEFAULTS, type MockupGridContractProps } from './MockupGrid.types'
import { MOCKUP_GRID_CARDS, MOCKUP_GRID_MARQUEE, mockupGridVariants } from './MockupGrid.variants'

/** Skeleton cards while loading, in the same wrap as real ones so nothing jumps when they arrive. */
export const LOADING_CARD_COUNT = 10

const CARD = '[data-mockup-id]'
/** A press on any of these starts no marquee. */
const NOT_EMPTY_SPACE = `${CARD}, button, a, input, textarea, select, [data-grid-ignore]`

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

export interface MockupGridProps
  extends MockupGridContractProps, Omit<ComponentProps<'div'>, keyof MockupGridContractProps> {
  /** The cards. Give each selectable card a `mockupId`; the Add card is never one of them. */
  children?: ReactNode
  /** Shared selection model (`useGridSelection`). Without it the grid is display-only. */
  selection?: GridSelection
  /** Opens the Add menu. Use `addCard` instead to wrap the card in a DropdownMenuTrigger. */
  onAdd?: () => void
  /** Replaces the default Add card, e.g. one wrapped in the Add menu trigger. */
  addCard?: ReactNode
  /** The `no-results` state's content, under the toolbar. */
  noResults?: ReactNode
  /** The `error` state's content, under the toolbar. */
  error?: ReactNode
  /** Cards per row for ↑ ↓. Measured from the layout when omitted. */
  columns?: number
  /** What assistive tech calls the list of cards. */
  listLabel?: string
}

function cardElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CARD))
}

function cardRects(root: HTMLElement): HitTarget[] {
  return cardElements(root).map((el) => ({
    id: el.dataset.mockupId ?? '',
    rect: el.getBoundingClientRect()
  }))
}

/** The grid's column tracks; where nothing lays out, the cards that share the first card's row. */
function measureColumns(root: HTMLElement): number {
  const list = root.querySelector('[data-slot="mockup-cards"]')
  const tracks = list ? trackCount(list) : 0
  if (tracks > 0) return tracks
  const cards = cardElements(root)
  if (cards.length === 0) return 1
  const firstTop = cards[0]?.getBoundingClientRect().top
  return Math.max(1, cards.filter((el) => el.getBoundingClientRect().top === firstTop).length)
}

/**
 * MockupGrid — Fill-width wrapping grid of MockupCards with loading / empty / no-results / error slots.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1902
 * Used by My Stash, the inboxes and Trash. Pass `selection` to get click, ⌘-click, ⇧-click, marquee, ⌘A, Esc and arrow-key
 * selection over the cards that carry a `mockupId`. The Add card never does, so it is never selected.
 */
export function MockupGrid({
  className,
  children,
  selection,
  onAdd,
  addCard,
  noResults,
  error,
  columns,
  listLabel = 'Mockups',
  onClick,
  onKeyDown,
  onMouseDown,
  ...rest
}: MockupGridProps) {
  const { state, showAdd, ...props } = { ...MOCKUP_GRID_DEFAULTS, ...rest }
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Rect | null>(null)

  // Handlers read the latest selection without re-binding the window listeners mid-drag.
  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  })

  // After an arrow key, focus follows the selection cursor.
  const focusCursor = useRef(false)
  const cursor = selection?.cursor
  useEffect(() => {
    if (!focusCursor.current || !cursor || !rootRef.current) return
    focusCursor.current = false
    cardElements(rootRef.current)
      .find((el) => el.dataset.mockupId === cursor)
      ?.focus()
  }, [cursor])

  const inside = (event: { target: EventTarget; currentTarget: Element }) =>
    event.target instanceof Node && event.currentTarget.contains(event.target)

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    onClick?.(event)
    if (!selection || !inside(event)) return
    const card = (event.target as Element).closest<HTMLElement>(CARD)
    if (!card?.dataset.mockupId) return
    selection.select(card.dataset.mockupId, event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (!selection || event.defaultPrevented || !inside(event)) return
    const modifier = event.metaKey || event.ctrlKey
    if (modifier && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selection.selectAll()
    } else if (event.key === 'Escape') {
      selection.clear()
    } else if (event.key in ARROWS && !modifier && !event.altKey) {
      event.preventDefault()
      const direction = ARROWS[event.key]
      if (!direction) return
      focusCursor.current = true
      selection.move(direction, event.shiftKey, columns ?? measureColumns(event.currentTarget))
    }
  }

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    onMouseDown?.(event)
    const root = rootRef.current
    if (!selection || !root || event.button !== 0 || !inside(event)) return
    if ((event.target as Element).closest(NOT_EMPTY_SPACE)) return

    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY }
    const additive = event.metaKey || event.ctrlKey
    const base = additive ? selection.selectedIds : []
    let dragging = false
    // The cards are measured once a drag, and again only when they move under the box.
    let rects: HitTarget[] | null = null
    let to: Point = start
    let frame: number | null = null

    // At most once a frame, however fast the pointer reports.
    const apply = () => {
      frame = null
      const next = marqueeRect(start, to)
      rects ??= cardRects(root)
      setBox(next)
      selectionRef.current?.marquee(marqueeHits(next, rects), base, additive)
    }
    const schedule = () => {
      frame ??= requestAnimationFrame(apply)
    }
    const move = (e: MouseEvent) => {
      const point = { x: e.clientX, y: e.clientY }
      if (!dragging && !exceedsDragThreshold(start, point)) return
      dragging = true
      to = point
      schedule()
    }
    // A scroll or resize moves the cards under the box.
    const remeasure = () => {
      rects = null
      if (dragging) schedule()
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('scroll', remeasure, true)
      window.removeEventListener('resize', remeasure)
      // The last position still counts when the button comes up before its frame.
      if (frame !== null) {
        cancelAnimationFrame(frame)
        apply()
      }
      setBox(null)
      // A press on empty space that never became a drag deselects, as in Finder.
      if (!dragging && !additive) selectionRef.current?.clear()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('scroll', remeasure, true)
    window.addEventListener('resize', remeasure)
  }

  // With a selection the cards are a multi-select list: each says whether it is selected and "3 of 128".
  const ids = selection?.ids
  const positions = useMemo(() => new Map(ids?.map((id, index) => [id, index + 1])), [ids])
  const cardLookup = useMemo(() => {
    if (!selection) return null
    return (id: string): GridCard | null => {
      const position = positions.get(id)
      if (position === undefined) return null
      return { selected: selection.isSelected(id), position, count: positions.size }
    }
  }, [selection, positions])
  const listbox = cardLookup !== null && state === 'populated'

  const add = addCard ?? <AddMockupCard onClick={onAdd} />
  const withCards = state === 'populated' || state === 'loading' || state === 'empty'
  const populated = state === 'populated'
  const withAdd = state === 'empty' || showAdd

  // Every cell in grid order. A big grid mounts only the rows near the view (F-071), and always
  // the selection cursor's, so arrow keys, focus and Reveal find its card.
  const cards = populated ? Children.toArray(children) : []
  const cells: ReactNode[] = [
    ...(withAdd ? [<Fragment key="add-card">{add}</Fragment>] : []),
    ...cards,
    ...(state === 'loading'
      ? Array.from({ length: LOADING_CARD_COUNT }, (_, index) => (
          <MockupCard key={`loading-${index}`} state="loading" />
        ))
      : [])
  ]
  // Each card's cell, by mockup id: the cursor's row stays mounted, and a reflow keeps its place.
  const cellIndex = new Map<string, number>()
  if (populated && cells.length >= WINDOW_FROM) {
    cards.forEach((card, at) => {
      if (isValidElement<{ mockupId?: string }>(card) && card.props.mockupId !== undefined)
        cellIndex.set(card.props.mockupId, at + (withAdd ? 1 : 0))
    })
  }
  const parts = useCardWindow(
    listRef,
    cells.length,
    populated,
    cursor ? (cellIndex.get(cursor) ?? null) : null,
    (mockupId) => cellIndex.get(mockupId)
  )
  const mounted: ReactNode[] = parts
    ? parts.flatMap<ReactNode>((part) =>
        part.kind === 'cells'
          ? cells.slice(part.from, part.to)
          : [
              // Stands in for rows that are not mounted; never a scroll anchor, so the view holds still.
              <div
                key={part.key}
                aria-hidden
                data-grid-rows=""
                className="col-span-full"
                style={{ height: part.height, overflowAnchor: 'none' }}
              />
            ]
      )
    : cells

  return (
    <div
      ref={rootRef}
      data-ds="MockupGrid"
      data-state={state}
      className={cn(mockupGridVariants({ state }), className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      {...props}
    >
      {withCards && (
        <div
          ref={listRef}
          data-slot="mockup-cards"
          className={MOCKUP_GRID_CARDS}
          {...(listbox
            ? { role: 'listbox', 'aria-multiselectable': true, 'aria-label': listLabel }
            : {})}
        >
          <GridCardContext.Provider value={cardLookup}>{mounted}</GridCardContext.Provider>
        </div>
      )}
      {state === 'no-results' && noResults}
      {state === 'error' && error}
      {box && (
        <div
          aria-hidden
          className={MOCKUP_GRID_MARQUEE}
          style={{
            left: box.left,
            top: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top
          }}
        />
      )}
    </div>
  )
}
