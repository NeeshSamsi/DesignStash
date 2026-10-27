import type { GroupMember, GroupingProposal, SortBoard } from '@shared/grouping'
import { pileTitle, type PileTitle } from '@shared/pile-title'
import { mockups } from '@renderer/lib/plural'

// The Sort board as a pure reducer: selection, drag and drop, piles, undo.
// Behaviour comes from the Sort flow (Figma B2 · Sort into piles, S2 to S8) and
// design/specs/pile-titles.md. Nothing here touches the DOM: the screen turns pointer events
// into actions (the marquee arrives as the ids its box touched) and draws what the state says.
// In code a pile's first member is its top ("leader" / "primary" stay as identifiers).

export interface BoardTile {
  id: number
  fileName: string
  folderTrail: string[]
  coverPath: string
  /** The cleaned name of the zip it came out of, which titles a pile from one zip. */
  archiveTitle?: string
}

export interface BoardPile {
  id: string
  /** Mockup ids, the top first. */
  memberIds: number[]
}

export type DropTarget =
  | { kind: 'pile'; pileId: string }
  /** Another tile: starts a pile when it stands alone, joins its pile otherwise. */
  | { kind: 'tile'; tileId: number }
  | { kind: 'standalone' }

export type DragState =
  | { kind: 'tiles'; ids: number[]; grabbed: number; over: DropTarget | null }
  | { kind: 'piles'; ids: string[]; over: DropTarget | null }

/** What one undo puts back. */
interface Snapshot {
  label: string
  piles: BoardPile[]
  standalone: number[]
  selectedTiles: number[]
  selectedPiles: string[]
  anchor: number | null
}

export interface BoardState {
  tiles: Record<number, BoardTile>
  /** Piles in board order. New piles go first. */
  piles: BoardPile[]
  /** Mockups on their own (the "On its own" tray), in tray order. */
  standalone: number[]
  /** In the order they were picked: the first is the top of a new pile. */
  selectedTiles: number[]
  selectedPiles: string[]
  /** The tile ⇧-click measures a range from. */
  anchor: number | null
  drag: DragState | null
  /** Plain words for the toast after the last change, with its Undo. */
  notice: string | null
  history: Snapshot[]
  /** Title of a pile's already-stashed top mockup (rule 0), by pile id. */
  stashedTitles: Record<string, string>
}

const HISTORY_LIMIT = 100

// ── Building a board ─────────────────────────────────────────────────────────────────────────

export interface BoardSource {
  members: GroupMember[]
  /** Piles, top first. Anything not listed stands alone. */
  groups: { id: string; memberIds: number[] }[]
  stashedTitles?: Record<string, string>
}

/** A board from what the grouping service proposed. */
export function boardFromProposal(
  proposal: GroupingProposal,
  stashedTitles: Record<string, string> = {}
): BoardState {
  const members = [...proposal.groups.flatMap((g) => g.members), ...proposal.singletons]
  return createBoard({
    members,
    groups: proposal.groups.map((g) => ({
      id: g.id,
      memberIds: [...g.members]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((m) => m.mockupId)
    })),
    stashedTitles
  })
}

/** A board from a saved one (Finish later) and the mockups it names. */
export function boardFromSaved(
  saved: SortBoard,
  members: GroupMember[],
  stashedTitles: Record<string, string> = {}
): BoardState {
  return createBoard({ members, groups: saved.groups, stashedTitles })
}

export function createBoard({ members, groups, stashedTitles = {} }: BoardSource): BoardState {
  const tiles: Record<number, BoardTile> = {}
  for (const m of members) {
    tiles[m.mockupId] = {
      id: m.mockupId,
      fileName: m.fileName,
      folderTrail: m.folderTrail,
      coverPath: m.coverPath,
      ...(m.archiveTitle ? { archiveTitle: m.archiveTitle } : {})
    }
  }
  const placed = new Set<number>()
  const piles: BoardPile[] = []
  for (const group of groups) {
    const memberIds = group.memberIds.filter((id) => tiles[id] && !placed.has(id) && placed.add(id))
    if (memberIds.length >= 2) piles.push({ id: group.id, memberIds })
    else memberIds.forEach((id) => placed.delete(id))
  }
  const standalone = members.map((m) => m.mockupId).filter((id) => !placed.has(id))
  return {
    tiles,
    piles,
    standalone,
    selectedTiles: [],
    selectedPiles: [],
    anchor: null,
    drag: null,
    notice: null,
    history: [],
    stashedTitles
  }
}

/** The board in the shape Finish later saves and Look them over confirms. */
export function toSortBoard(state: BoardState, batchId: string): SortBoard {
  return {
    batchId,
    groups: state.piles.map((p) => ({ id: p.id, memberIds: [...p.memberIds] })),
    singletonIds: [...state.standalone]
  }
}

/**
 * A board opened on a few mockups (“Sort 3”) put back into the whole board, for Finish later:
 * those mockups leave wherever the whole board had them and take the places they have now. A pile
 * left with one mockup dissolves. A pile split between the two keeps its id in the whole, and the
 * part's half gets a fresh one.
 */
export function mergeBoard(whole: SortBoard, part: SortBoard, freshId: () => string): SortBoard {
  const moved = new Set([...part.groups.flatMap((g) => g.memberIds), ...part.singletonIds])
  const kept = whole.groups.map((g) => ({
    id: g.id,
    memberIds: g.memberIds.filter((id) => !moved.has(id))
  }))
  const piles = kept.filter((g) => g.memberIds.length >= 2)
  const taken = new Set(piles.map((g) => g.id))
  return {
    batchId: whole.batchId,
    groups: [...piles, ...part.groups.map((g) => (taken.has(g.id) ? { ...g, id: freshId() } : g))],
    singletonIds: [
      ...whole.singletonIds.filter((id) => !moved.has(id)),
      ...kept.filter((g) => g.memberIds.length === 1).flatMap((g) => g.memberIds),
      ...part.singletonIds
    ]
  }
}

// ── Reading a board ──────────────────────────────────────────────────────────────────────────

/** Every tile in reading order: piles first, then the tray. */
export function boardOrder(state: BoardState): number[] {
  return [...state.piles.flatMap((p) => p.memberIds), ...state.standalone]
}

export const pileOf = (state: BoardState, tileId: number): BoardPile | undefined =>
  state.piles.find((p) => p.memberIds.includes(tileId))

export const getPile = (state: BoardState, pileId: string): BoardPile | undefined =>
  state.piles.find((p) => p.id === pileId)

/** The title of a pile, re-derived from its members on every call (rules 0 to 3). */
export function titleOfPile(state: BoardState, pile: BoardPile): PileTitle {
  const members = pile.memberIds.map((id, index) => ({
    fileName: state.tiles[id]!.fileName,
    folderTrail: state.tiles[id]!.folderTrail,
    isPrimary: index === 0,
    ...(state.tiles[id]!.archiveTitle ? { archiveTitle: state.tiles[id]!.archiveTitle } : {})
  }))
  const stashedTitle = state.stashedTitles[pile.id]
  return pileTitle(members, stashedTitle ? { stashedTitle } : {})
}

export const countLabel = (pile: BoardPile): string => mockups(pile.memberIds.length)

export const isTileSelected = (state: BoardState, tileId: number) =>
  state.selectedTiles.includes(tileId)
export const isPileSelected = (state: BoardState, pileId: string) =>
  state.selectedPiles.includes(pileId)

/** The tiles an action on the selection would act on: tiles, or the tiles of selected piles. */
export function selectionTileIds(state: BoardState): number[] {
  if (state.selectedTiles.length) return state.selectedTiles
  return state.selectedPiles.flatMap((id) => getPile(state, id)?.memberIds ?? [])
}

/** ⌘G is off for fewer than two tiles, and for a selection that is exactly one whole pile. */
export function canNewPile(state: BoardState): boolean {
  const ids = state.selectedTiles
  if (ids.length < 2) return false
  return !state.piles.some(
    (p) => p.memberIds.length === ids.length && p.memberIds.every((id) => ids.includes(id))
  )
}

export function canPutOnTop(state: BoardState): boolean {
  const [only] = state.selectedTiles
  if (state.selectedTiles.length !== 1 || only === undefined) return false
  const pile = pileOf(state, only)
  return !!pile && pile.memberIds[0] !== only
}

export function canTakeOut(state: BoardState): boolean {
  return state.selectedTiles.some((id) => pileOf(state, id))
}

export function canDisband(state: BoardState): boolean {
  return disbandTargets(state).length > 0
}

export interface MoveTargets {
  /** Every pile that doesn't already hold all the selected tiles. */
  piles: { pileId: string; title: string; count: number }[]
  standalone: boolean
  newPile: boolean
}

/** What the Move to ▸ submenu lists for the selected tiles. */
export function moveTargets(state: BoardState): MoveTargets {
  const ids = state.selectedTiles
  return {
    piles: state.piles
      .filter((p) => !ids.every((id) => p.memberIds.includes(id)))
      .map((p) => ({
        pileId: p.id,
        title: titleOfPile(state, p).title,
        count: p.memberIds.length
      })),
    standalone: ids.some((id) => pileOf(state, id)),
    newPile: canNewPile(state)
  }
}

export function undoLabel(state: BoardState): string | null {
  return state.history[state.history.length - 1]?.label ?? null
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────

export type BoardAction =
  | { type: 'click-tile'; id: number; meta?: boolean; shift?: boolean }
  | { type: 'click-pile-header'; pileId: string; meta?: boolean }
  | { type: 'click-empty' }
  /** Right-click: a tile outside the selection becomes the selection, like Finder. */
  | { type: 'context-tile'; id: number }
  | { type: 'context-pile'; pileId: string }
  | { type: 'select-all' }
  | { type: 'select-pile-tiles'; pileId: string }
  /** The ids a marquee box touched. A pile counts only when its header is reached and every tile is covered. */
  | { type: 'marquee'; tileIds: number[]; headerPileIds: string[]; additive?: boolean }
  | { type: 'drag-start-tile'; id: number }
  | { type: 'drag-start-pile'; pileId: string }
  | { type: 'drag-over'; target: DropTarget | null }
  | { type: 'drop'; target: DropTarget | null }
  | { type: 'cancel' }
  | { type: 'new-pile'; topId?: number }
  | { type: 'disband'; pileIds?: string[] }
  | { type: 'merge'; targetId: string; sourceIds?: string[] }
  | { type: 'put-on-top'; tileId?: number }
  | { type: 'move-to'; destination: DropTarget | { kind: 'new-pile' } }
  | { type: 'take-out' }
  | { type: 'undo' }
  | { type: 'dismiss-notice' }

const without = <T>(list: T[], remove: T[]) => list.filter((x) => !remove.includes(x))
const unique = <T>(list: T[]) => [...new Set(list)]

/** Pulls tiles out of piles and the tray. */
function lift(state: BoardState, ids: number[]) {
  return {
    piles: state.piles.map((p) => ({ ...p, memberIds: without(p.memberIds, ids) })),
    standalone: without(state.standalone, ids)
  }
}

/** A pile left with one tile dissolves into the tray; an empty one goes. */
function settle(piles: BoardPile[], standalone: number[]) {
  const kept: BoardPile[] = []
  const tray = [...standalone]
  for (const pile of piles) {
    if (pile.memberIds.length >= 2) kept.push(pile)
    else tray.push(...pile.memberIds)
  }
  return { piles: kept, standalone: tray }
}

const snapshot = (state: BoardState, label: string): Snapshot => ({
  label,
  piles: state.piles,
  standalone: state.standalone,
  selectedTiles: state.selectedTiles,
  selectedPiles: state.selectedPiles,
  anchor: state.anchor
})

/** Names every pile whose top changed, for the toast ("X is now the top mockup"). */
function topChanges(before: BoardState, piles: BoardPile[]): string[] {
  const names: string[] = []
  for (const pile of piles) {
    const was = getPile(before, pile.id)
    const now = pile.memberIds[0]
    if (was && now !== undefined && was.memberIds[0] !== now)
      names.push(before.tiles[now]!.fileName)
  }
  return names
}

function topNotice(names: string[]): string {
  if (names.length === 0) return ''
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return ` ${list} ${names.length === 1 ? 'is now the top mockup' : 'are now the top mockups'}.`
}

interface Change {
  label: string
  notice: string
  piles: BoardPile[]
  standalone: number[]
  selectedTiles?: number[]
  selectedPiles?: string[]
}

/** Applies a change, settles small piles and records one undo step. */
function commit(state: BoardState, change: Change): BoardState {
  const settled = settle(change.piles, change.standalone)
  const survivors = new Set(settled.piles.map((p) => p.id))
  const selectedPiles = (change.selectedPiles ?? state.selectedPiles).filter((id) =>
    survivors.has(id)
  )
  const names = topChanges(state, settled.piles)
  // Only a top that changed for a reason other than the change itself (taken out, a pile left behind).
  const extra = change.label === 'Put on top' ? '' : topNotice(names)
  return {
    ...state,
    piles: settled.piles,
    standalone: settled.standalone,
    selectedTiles: change.selectedTiles ?? state.selectedTiles,
    selectedPiles,
    drag: null,
    notice: change.notice + extra,
    history: [...state.history, snapshot(state, change.label)].slice(-HISTORY_LIMIT)
  }
}

function withSelection(
  state: BoardState,
  tiles: number[],
  anchor: number | null = state.anchor
): BoardState {
  return { ...state, selectedTiles: tiles, selectedPiles: [], anchor }
}

function clickTile(state: BoardState, id: number, meta?: boolean, shift?: boolean): BoardState {
  if (!state.tiles[id]) return state
  const tilesOnly = state.selectedPiles.length === 0
  if (meta) {
    const current = tilesOnly ? state.selectedTiles : []
    const next = current.includes(id) ? without(current, [id]) : [...current, id]
    return withSelection(state, next, id)
  }
  if (shift) {
    const home = containerOf(state, id)
    const from = state.anchor
    // A range can't span piles: a tile in a different pile is simply added.
    if (tilesOnly && from !== null && from !== id && containerOf(state, from) === home) {
      const line = home === 'tray' ? state.standalone : getPile(state, home)!.memberIds
      const [a, b] = [line.indexOf(from), line.indexOf(id)].sort((x, y) => x - y) as [
        number,
        number
      ]
      return withSelection(state, line.slice(a, b + 1), from)
    }
    const current = tilesOnly ? state.selectedTiles : []
    return withSelection(state, unique([...current, id]), id)
  }
  return withSelection(state, [id], id)
}

/** The pile id a tile sits in, or 'tray'. */
function containerOf(state: BoardState, id: number): string {
  return pileOf(state, id)?.id ?? 'tray'
}

function disbandTargets(state: BoardState): string[] {
  if (state.selectedPiles.length) return state.selectedPiles
  return unique(
    state.selectedTiles.map((id) => pileOf(state, id)?.id).filter((x): x is string => !!x)
  )
}

/** Moves tiles to the end of a pile. Tiles already there stay where they are. */
function dropIntoPile(state: BoardState, ids: number[], pileId: string): BoardState {
  const target = getPile(state, pileId)
  if (!target) return state
  const moving = ids.filter((id) => !target.memberIds.includes(id))
  if (!moving.length) return { ...state, drag: null }
  const lifted = lift(state, moving)
  const piles = lifted.piles.map((p) =>
    p.id === pileId ? { ...p, memberIds: [...p.memberIds, ...moving] } : p
  )
  return commit(state, {
    label: `Move ${mockups(moving.length)}`,
    notice: `Added ${mockups(moving.length)} to ${titleOfPile({ ...state, piles }, piles.find((p) => p.id === pileId)!).title}.`,
    piles,
    standalone: lifted.standalone,
    selectedTiles: ids,
    selectedPiles: []
  })
}

/** Starts a pile: `topId` leads, then the rest in order. It goes first on the board. */
function startPile(
  state: BoardState,
  ids: number[],
  topId: number,
  newPileId: () => string
): BoardState {
  const members = [topId, ...ids.filter((id) => id !== topId)]
  const lifted = lift(state, members)
  const created: BoardPile = { id: newPileId(), memberIds: members }
  const piles = [created, ...lifted.piles]
  return commit(state, {
    label: 'New pile',
    notice: `New pile of ${mockups(members.length)}.`,
    piles,
    standalone: lifted.standalone,
    selectedTiles: ids,
    selectedPiles: []
  })
}

function takeOut(state: BoardState, ids: number[]): BoardState {
  const moving = ids.filter((id) => pileOf(state, id))
  if (!moving.length) return { ...state, drag: null }
  const lifted = lift(state, moving)
  return commit(state, {
    label: `Take ${mockups(moving.length)} out`,
    notice: `Moved ${mockups(moving.length)} to On its own.`,
    piles: lifted.piles,
    standalone: [...lifted.standalone, ...moving],
    selectedTiles: ids,
    selectedPiles: []
  })
}

function disband(state: BoardState, pileIds: string[]): BoardState {
  const doomed = state.piles.filter((p) => pileIds.includes(p.id))
  if (!doomed.length) return { ...state, drag: null }
  const freed = doomed.flatMap((p) => p.memberIds)
  return commit(state, {
    label: doomed.length === 1 ? 'Disband pile' : `Disband ${doomed.length} piles`,
    notice: doomed.length === 1 ? 'Pile broken up.' : `${doomed.length} piles broken up.`,
    piles: state.piles.filter((p) => !pileIds.includes(p.id)),
    standalone: [...state.standalone, ...freed],
    selectedTiles: freed,
    selectedPiles: []
  })
}

/** Folds piles into one. The target keeps its top. */
function merge(state: BoardState, targetId: string, sourceIds: string[]): BoardState {
  const target = getPile(state, targetId)
  const sources = state.piles.filter((p) => sourceIds.includes(p.id) && p.id !== targetId)
  if (!target || !sources.length) return { ...state, drag: null }
  const absorbed = sources.flatMap((p) => p.memberIds)
  const piles = state.piles
    .filter((p) => !sources.some((s) => s.id === p.id))
    .map((p) => (p.id === targetId ? { ...p, memberIds: [...p.memberIds, ...absorbed] } : p))
  return commit(state, {
    label: sources.length === 1 ? 'Merge piles' : `Merge ${sources.length + 1} piles`,
    notice: `Merged ${sources.length + 1} piles into ${titleOfPile({ ...state, piles }, piles.find((p) => p.id === targetId)!).title}.`,
    piles,
    standalone: state.standalone,
    selectedTiles: [],
    selectedPiles: [targetId]
  })
}

function drop(state: BoardState, target: DropTarget | null, newPileId: () => string): BoardState {
  const drag = state.drag
  // Dropping somewhere that isn't a pile, a tile or On its own sends the stack back.
  if (!drag || !target) return { ...state, drag: null }

  if (drag.kind === 'piles') {
    if (target.kind === 'standalone') return disband(state, drag.ids)
    const pileId = target.kind === 'pile' ? target.pileId : pileOf(state, target.tileId)?.id
    if (!pileId || drag.ids.includes(pileId)) return { ...state, drag: null }
    return merge(state, pileId, drag.ids)
  }

  const ids = drag.ids
  if (target.kind === 'standalone') return takeOut(state, ids)
  if (target.kind === 'pile') return dropIntoPile(state, ids, target.pileId)
  if (ids.includes(target.tileId)) return { ...state, drag: null }
  const home = pileOf(state, target.tileId)
  // On a tile inside a pile, it joins that pile; on a tile standing alone, they start a pile.
  if (home) return dropIntoPile(state, ids, home.id)
  return startPile(state, ids, target.tileId, newPileId)
}

/** Makes the reducer. `newPileId` mints the id of each pile the user starts; it must be unique across sessions, since boards are saved. */
export const makeBoardReducer =
  (newPileId: () => string) =>
  (state: BoardState, action: BoardAction): BoardState =>
    reduce(state, action, newPileId)

function reduce(state: BoardState, action: BoardAction, newPileId: () => string): BoardState {
  switch (action.type) {
    case 'click-tile':
      return clickTile(state, action.id, action.meta, action.shift)

    case 'click-pile-header': {
      if (!getPile(state, action.pileId)) return state
      const current = state.selectedTiles.length ? [] : state.selectedPiles
      const next = action.meta
        ? current.includes(action.pileId)
          ? without(current, [action.pileId])
          : [...current, action.pileId]
        : [action.pileId]
      return { ...state, selectedPiles: next, selectedTiles: [], anchor: null }
    }

    case 'click-empty':
      return { ...state, selectedTiles: [], selectedPiles: [], anchor: null }

    case 'context-tile':
      if (!state.tiles[action.id]) return state
      return state.selectedTiles.includes(action.id) && !state.selectedPiles.length
        ? state
        : withSelection(state, [action.id], action.id)

    case 'context-pile':
      if (!getPile(state, action.pileId) || state.selectedPiles.includes(action.pileId))
        return state
      return { ...state, selectedPiles: [action.pileId], selectedTiles: [], anchor: null }

    case 'select-all':
      return withSelection(state, boardOrder(state), null)

    case 'select-pile-tiles': {
      const pile = getPile(state, action.pileId)
      return pile ? withSelection(state, [...pile.memberIds], pile.memberIds[0] ?? null) : state
    }

    case 'marquee': {
      const touched = new Set(action.tileIds)
      const whole = action.headerPileIds.filter((pileId) => {
        const pile = getPile(state, pileId)
        return !!pile && pile.memberIds.every((id) => touched.has(id))
      })
      const inWhole = new Set(whole.flatMap((pileId) => getPile(state, pileId)!.memberIds))
      const tiles = action.tileIds.filter((id) => state.tiles[id] && !inWhole.has(id))
      const pilesNow = action.additive ? state.selectedPiles : []
      const tilesNow = action.additive ? state.selectedTiles : []
      return {
        ...state,
        selectedPiles: unique([...pilesNow, ...whole]),
        selectedTiles: unique([...tilesNow, ...tiles]),
        anchor: null
      }
    }

    case 'drag-start-tile': {
      if (!state.tiles[action.id]) return state
      // Grabbing a selected tile takes the whole selection; any other tile goes alone.
      const picked = state.selectedTiles.includes(action.id) && !state.selectedPiles.length
      const order = boardOrder(state)
      const ids = picked ? order.filter((id) => state.selectedTiles.includes(id)) : [action.id]
      const base = picked ? state : withSelection(state, [action.id], action.id)
      return { ...base, drag: { kind: 'tiles', ids, grabbed: action.id, over: null } }
    }

    case 'drag-start-pile': {
      if (!getPile(state, action.pileId)) return state
      const picked = state.selectedPiles.includes(action.pileId)
      const ids = picked
        ? state.piles.map((p) => p.id).filter((id) => state.selectedPiles.includes(id))
        : [action.pileId]
      const base = picked
        ? state
        : { ...state, selectedPiles: ids, selectedTiles: [], anchor: null }
      return { ...base, drag: { kind: 'piles', ids, over: null } }
    }

    case 'drag-over':
      return state.drag ? { ...state, drag: { ...state.drag, over: action.target } } : state

    case 'drop':
      return drop(state, action.target, newPileId)

    case 'cancel':
      // Esc: first cancel what is in hand, then clear the selection. Nothing moves either way.
      if (state.drag) return { ...state, drag: null }
      return { ...state, selectedTiles: [], selectedPiles: [], anchor: null }

    case 'new-pile': {
      if (!canNewPile(state)) return state
      const ids = state.selectedTiles
      const top = action.topId !== undefined && ids.includes(action.topId) ? action.topId : ids[0]!
      return startPile(state, ids, top, newPileId)
    }

    case 'disband':
      return disband(state, action.pileIds ?? disbandTargets(state))

    case 'merge': {
      const sources = action.sourceIds ?? state.selectedPiles
      return merge(state, action.targetId, sources)
    }

    case 'put-on-top': {
      const id = action.tileId ?? (canPutOnTop(state) ? state.selectedTiles[0] : undefined)
      const pile = id === undefined ? undefined : pileOf(state, id)
      if (id === undefined || !pile || pile.memberIds[0] === id) return state
      const piles = state.piles.map((p) =>
        p.id === pile.id ? { ...p, memberIds: [id, ...without(p.memberIds, [id])] } : p
      )
      return commit(state, {
        label: 'Put on top',
        notice: `${state.tiles[id]!.fileName} is now the top mockup.`,
        piles,
        standalone: state.standalone,
        selectedTiles: [id],
        selectedPiles: []
      })
    }

    case 'move-to': {
      const ids = selectionTileIds(state)
      if (!ids.length) return state
      const to = action.destination
      if (to.kind === 'new-pile')
        return canNewPile(state) ? startPile(state, ids, ids[0]!, newPileId) : state
      if (to.kind === 'standalone') return takeOut(state, ids)
      if (to.kind === 'pile') return dropIntoPile(state, ids, to.pileId)
      return state
    }

    case 'take-out':
      return takeOut(state, state.selectedTiles)

    case 'undo': {
      const last = state.history[state.history.length - 1]
      if (!last) return state
      return {
        ...state,
        piles: last.piles,
        standalone: last.standalone,
        selectedTiles: last.selectedTiles,
        selectedPiles: last.selectedPiles,
        anchor: last.anchor,
        drag: null,
        notice: null,
        history: state.history.slice(0, -1)
      }
    }

    case 'dismiss-notice':
      return state.notice ? { ...state, notice: null } : state
  }
}
