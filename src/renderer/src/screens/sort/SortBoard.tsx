import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { GroupCard } from '@renderer/components/GroupCard'
import { GroupMemberThumb } from '@renderer/components/GroupMemberThumb'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import {
  countLabel,
  getPile,
  isPileSelected,
  isTileSelected,
  pileOf,
  titleOfPile,
  type BoardAction,
  type BoardPile,
  type BoardState,
  type DropTarget
} from './board-model'
import type { MenuTarget } from './menu-model'
import { coverUrl } from '@shared/cover-url'

export interface SortBoardProps {
  state: BoardState
  /** Actions that make a pile arrive with a fresh id (the session fills it in). */
  dispatch: Dispatch<BoardAction>
  /** Open the menu for a target at a point. The board has already applied the right-click. */
  onMenu: (target: MenuTarget, at: { x: number; y: number }) => void
  className?: string
}

const TRAY = 'tray'
const tileDnd = (id: number) => `tile:${id}`
const pileDnd = (id: string) => `pile:${id}`

/** A cover on disk, as the renderer loads it. */
const coverSrc = (path: string) => (path ? coverUrl(path) : undefined)

function targetOf(id: string | number | undefined): DropTarget | null {
  const value = String(id ?? '')
  if (value === TRAY) return { kind: 'standalone' }
  if (value.startsWith('tile:')) return { kind: 'tile', tileId: Number(value.slice(5)) }
  if (value.startsWith('pile:')) return { kind: 'pile', pileId: value.slice(5) }
  return null
}

/** A tile: pick it up, drop on it, click it, right-click it. */
function Tile({
  state,
  tileId,
  dispatch,
  onMenu,
  visual,
  top
}: {
  state: BoardState
  tileId: number
  dispatch: Dispatch<BoardAction>
  onMenu: SortBoardProps['onMenu']
  visual: 'idle' | 'selected' | 'left-behind' | 'pile-target'
  top: boolean
}) {
  const tile = state.tiles[tileId]!
  const drag = useDraggable({ id: tileDnd(tileId) })
  const drop = useDroppable({ id: tileDnd(tileId) })
  return (
    <GroupMemberThumb
      {...drag.listeners}
      ref={(node: HTMLDivElement | null) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      tileId={String(tileId)}
      filename={tile.fileName}
      primary={top}
      state={visual}
      {...(coverSrc(tile.coverPath) ? { coverSrc: coverSrc(tile.coverPath)! } : {})}
      onClick={(event) => {
        event.stopPropagation()
        dispatch({ type: 'click-tile', id: tileId, meta: event.metaKey, shift: event.shiftKey })
      }}
      onMore={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        dispatch({ type: 'context-tile', id: tileId })
        onMenu({ kind: 'tile', tileId }, { x: box.left, y: box.bottom })
      }}
    />
  )
}

/** A pile: the header is its handle, the body is a drop zone. */
function Pile({
  state,
  pile,
  dispatch,
  onMenu,
  visual,
  last,
  children
}: {
  state: BoardState
  pile: BoardPile
  dispatch: Dispatch<BoardAction>
  onMenu: SortBoardProps['onMenu']
  visual: 'idle' | 'selected' | 'drag-over' | 'merge-target' | 'left-behind'
  /** An odd last pile is alone on its row and takes the full width. */
  last: boolean
  children: React.ReactNode
}) {
  const title = titleOfPile(state, pile)
  const drag = useDraggable({ id: pileDnd(pile.id) })
  const drop = useDroppable({ id: pileDnd(pile.id) })
  // Only the header carries the pile; the tiles inside start their own drags.
  const { onPointerDown, ...handle } = drag.listeners ?? {}
  return (
    <GroupCard
      {...handle}
      ref={(node: HTMLDivElement | null) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      className={cn('@container/pile', last && 'col-span-2')}
      pileId={pile.id}
      title={title.title}
      showFolder={title.source === 'folder'}
      showReason={title.reason !== undefined}
      {...(title.reason ? { reason: title.reason } : {})}
      count={pile.memberIds.length}
      state={visual}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-handle]') && !target.closest('button')) {
          ;(onPointerDown as ((e: ReactPointerEvent<HTMLDivElement>) => void) | undefined)?.(event)
        }
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-handle]') && !target.closest('button')) {
          event.stopPropagation()
          dispatch({ type: 'click-pile-header', pileId: pile.id, meta: event.metaKey })
        }
      }}
      onMore={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        dispatch({ type: 'context-pile', pileId: pile.id })
        onMenu({ kind: 'pile', pileId: pile.id }, { x: box.left, y: box.bottom })
      }}
      members={children}
    />
  )
}

/** The marquee: press on empty space and drag; every tile the box touches is selected, live. */
function useMarquee(root: RefObject<HTMLDivElement | null>, dispatch: Dispatch<BoardAction>) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const didDrag = useRef(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('[data-tile-id], [data-handle], button')) return
    const origin = { x: event.clientX, y: event.clientY }
    didDrag.current = false
    const move = (e: PointerEvent) => {
      const w = Math.abs(e.clientX - origin.x)
      const h = Math.abs(e.clientY - origin.y)
      if (!didDrag.current && w < 4 && h < 4) return
      didDrag.current = true
      const rect = { x: Math.min(e.clientX, origin.x), y: Math.min(e.clientY, origin.y), w, h }
      setBox(rect)
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect()
        return (
          r.right >= rect.x &&
          r.left <= rect.x + rect.w &&
          r.bottom >= rect.y &&
          r.top <= rect.y + rect.h
        )
      }
      const scope = root.current
      if (!scope) return
      const tileIds = [...scope.querySelectorAll<HTMLElement>('[data-tile-id]')]
        .filter(hit)
        .map((el) => Number(el.dataset.tileId))
      const headerPileIds = [...scope.querySelectorAll<HTMLElement>('[data-pile-id] [data-handle]')]
        .filter(hit)
        .map((el) => el.closest<HTMLElement>('[data-pile-id]')!.dataset.pileId!)
      dispatch({ type: 'marquee', tileIds, headerPileIds, additive: e.metaKey })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setBox(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** A click that ended a marquee must not also clear the selection it just made. */
  const consumeClick = () => {
    const was = didDrag.current
    didDrag.current = false
    return was
  }
  return { box, onPointerDown, consumeClick }
}

/**
 * SortBoard — the piles and the On its own tray, with selection, drag and drop, marquee and menus.
 * Figma: ↳ Sort › B2 · Sort into piles (S1 to S9). All behaviour is in board-model; this draws it
 * and turns pointer events into its actions. Two piles share a row; an odd last pile and the tray
 * take the full width.
 */
export function SortBoard({ state, dispatch, onMenu, className }: SortBoardProps) {
  const root = useRef<HTMLDivElement>(null)
  const marquee = useMarquee(root, dispatch)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const drag = state.drag

  const tilesDrag = drag?.kind === 'tiles' ? drag : null
  const pilesDrag = drag?.kind === 'piles' ? drag : null
  const draggedTiles = tilesDrag?.ids ?? []
  const draggedPiles = pilesDrag?.ids ?? []
  const over = drag?.over ?? null

  /** The pile a drop would land in: the pile itself, or the pile of the tile under the pointer. */
  const overPileId =
    over?.kind === 'pile'
      ? over.pileId
      : over?.kind === 'tile'
        ? pileOf(state, over.tileId)?.id
        : undefined

  // Tiles first: they sit inside piles, so the pointer is over both and the tile wins.
  const collision: CollisionDetection = (args) => {
    const own = new Set([...draggedTiles.map(tileDnd), ...draggedPiles.map(pileDnd)])
    const hits = pointerWithin(args).filter((c) => !own.has(String(c.id)))
    const tile = hits.find((c) => String(c.id).startsWith('tile:'))
    if (tile) return [tile]
    return hits.length > 0 ? hits : rectIntersection(args).filter((c) => !own.has(String(c.id)))
  }

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('tile:')) dispatch({ type: 'drag-start-tile', id: Number(id.slice(5)) })
    else if (id.startsWith('pile:')) dispatch({ type: 'drag-start-pile', pileId: id.slice(5) })
  }
  const onDragOver = (event: DragOverEvent) =>
    dispatch({ type: 'drag-over', target: targetOf(event.over?.id) })

  const tileVisual = (id: number) => {
    if (draggedTiles.includes(id)) return 'left-behind' as const
    if (over?.kind === 'tile' && over.tileId === id && !pileOf(state, id))
      return 'pile-target' as const
    return isTileSelected(state, id) ? ('selected' as const) : ('idle' as const)
  }
  const pileVisual = (id: string) => {
    if (draggedPiles.includes(id)) return 'left-behind' as const
    if (overPileId === id)
      return drag?.kind === 'piles' ? ('merge-target' as const) : ('drag-over' as const)
    return isPileSelected(state, id) ? ('selected' as const) : ('idle' as const)
  }

  /** One dashed ghost per dragged tile that isn't already there, where it would land. */
  const ghosts = (pileId: string) => {
    if (overPileId !== pileId || !drag || drag.kind !== 'tiles') return null
    const there = getPile(state, pileId)?.memberIds ?? []
    return drag.ids
      .filter((id) => !there.includes(id))
      .map((id) => <GroupMemberThumb key={`ghost-${id}`} state="drop-ghost" filename="" />)
  }

  const tile = (id: number, index: number, inPile: boolean) => (
    <Tile
      key={id}
      state={state}
      tileId={id}
      dispatch={dispatch}
      onMenu={onMenu}
      visual={tileVisual(id)}
      top={inPile && index === 0}
    />
  )

  const tray = useDroppable({ id: TRAY })
  const lastIsAlone = state.piles.length % 2 === 1

  useEffect(() => {
    // Focus lives on the board, so ⌘A, ⌘G and friends reach it (scope "sort").
    root.current?.focus({ preventScroll: true })
  }, [])

  const grabbed =
    draggedTiles.length > 0 ? state.tiles[(drag as { grabbed: number }).grabbed] : undefined
  const grabbedPile = draggedPiles[0] ? getPile(state, draggedPiles[0]) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(event) => dispatch({ type: 'drop', target: targetOf(event.over?.id) })}
      onDragCancel={() => dispatch({ type: 'cancel' })}
    >
      <div
        ref={root}
        data-ds="SortBoard"
        data-shortcut-scope="sort"
        tabIndex={-1}
        role="application"
        aria-label="Sort board"
        onPointerDown={marquee.onPointerDown}
        onClick={(event: MouseEvent<HTMLDivElement>) => {
          if (marquee.consumeClick()) return
          const target = event.target as HTMLElement
          if (!target.closest('[data-tile-id], [data-handle], button'))
            dispatch({ type: 'click-empty' })
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          const at = { x: event.clientX, y: event.clientY }
          const target = event.target as HTMLElement
          const tileEl = target.closest<HTMLElement>('[data-tile-id]')
          const pileEl = target.closest<HTMLElement>('[data-pile-id]')
          if (tileEl) {
            const tileId = Number(tileEl.dataset.tileId)
            dispatch({ type: 'context-tile', id: tileId })
            onMenu({ kind: 'tile', tileId }, at)
          } else if (pileEl) {
            const pileId = pileEl.dataset.pileId!
            dispatch({ type: 'context-pile', pileId })
            onMenu({ kind: 'pile', pileId }, at)
          } else {
            onMenu({ kind: 'board' }, at)
          }
        }}
        className={cn('flex min-h-full flex-col gap-6 outline-none', className)}
      >
        {state.piles.length > 0 && (
          <div className="grid grid-cols-2 gap-6">
            {state.piles.map((pile, index) => (
              <Pile
                key={pile.id}
                state={state}
                pile={pile}
                dispatch={dispatch}
                onMenu={onMenu}
                visual={pileVisual(pile.id)}
                last={lastIsAlone && index === state.piles.length - 1}
              >
                {pile.memberIds.map((id, i) => tile(id, i, true))}
                {ghosts(pile.id)}
              </Pile>
            ))}
          </div>
        )}
        <GroupCard
          ref={(node: HTMLDivElement | null) => tray.setNodeRef(node)}
          data-tray=""
          className="flex-1 @container/pile"
          variant="standalone"
          state={
            state.standalone.length === 0
              ? 'empty'
              : over?.kind === 'standalone'
                ? 'drag-over'
                : 'idle'
          }
          count={state.standalone.length}
          members={
            state.standalone.length === 0 ? null : (
              <>
                {state.standalone.map((id, i) => tile(id, i, false))}
                {over?.kind === 'standalone' &&
                  drag?.kind === 'tiles' &&
                  drag.ids
                    .filter((id) => !state.standalone.includes(id))
                    .map((id) => (
                      <GroupMemberThumb key={`ghost-${id}`} state="drop-ghost" filename="" />
                    ))}
              </>
            )
          }
        />
        {marquee.box && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 rounded-lg border border-primary bg-primary-weak"
            style={{
              left: marquee.box.x,
              top: marquee.box.y,
              width: marquee.box.w,
              height: marquee.box.h
            }}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {grabbed && (
          <div className="relative w-32">
            <GroupMemberThumb state="lifted" filename={grabbed.fileName} />
            {draggedTiles.length > 1 && (
              <Badge variant="default" className="absolute -top-2 -right-2">
                {draggedTiles.length}
              </Badge>
            )}
          </div>
        )}
        {grabbedPile && (
          <GroupCard
            state="lifted"
            title={titleOfPile(state, grabbedPile).title}
            count={grabbedPile.memberIds.length}
            showFolder={titleOfPile(state, grabbedPile).source === 'folder'}
            members={<span />}
            className="w-80"
          />
        )}
      </DragOverlay>
      <span className="sr-only" aria-live="polite">
        {state.selectedTiles.length > 0
          ? `${countLabel({ id: '', memberIds: state.selectedTiles })} selected`
          : ''}
      </span>
    </DndContext>
  )
}
