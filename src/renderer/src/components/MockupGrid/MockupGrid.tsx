import {
  useEffect,
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
  type Rect
} from '@renderer/lib/marquee'
import { cn } from '@renderer/lib/utils'
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

/** Cards that share the first card's row. */
function measureColumns(root: HTMLElement): number {
  const cards = cardElements(root)
  if (cards.length === 0) return 1
  const firstTop = cards[0]?.getBoundingClientRect().top
  return Math.max(1, cards.filter((el) => el.getBoundingClientRect().top === firstTop).length)
}

/**
 * MockupGrid — Fill-width wrapping grid of MockupCards with loading / empty / no-results / error slots.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1902
 * Today: MockupGrid.tsx. Pass `selection` to get click, ⌘-click, ⇧-click, marquee, ⌘A, Esc and arrow-key
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
  onClick,
  onKeyDown,
  onMouseDown,
  ...rest
}: MockupGridProps) {
  const { state, showAdd, ...props } = { ...MOCKUP_GRID_DEFAULTS, ...rest }
  const rootRef = useRef<HTMLDivElement>(null)
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

    const move = (e: MouseEvent) => {
      const to = { x: e.clientX, y: e.clientY }
      if (!dragging && !exceedsDragThreshold(start, to)) return
      dragging = true
      const next = marqueeRect(start, to)
      setBox(next)
      selectionRef.current?.marquee(marqueeHits(next, cardRects(root)), base, additive)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setBox(null)
      // A press on empty space that never became a drag deselects, as in Finder.
      if (!dragging && !additive) selectionRef.current?.clear()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const add = addCard ?? <AddMockupCard onClick={onAdd} />
  const withCards = state === 'populated' || state === 'loading' || state === 'empty'

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
        <div className={MOCKUP_GRID_CARDS}>
          {(state === 'empty' || showAdd) && add}
          {state === 'populated' && children}
          {state === 'loading' &&
            Array.from({ length: LOADING_CARD_COUNT }, (_, index) => (
              <MockupCard key={index} state="loading" />
            ))}
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
