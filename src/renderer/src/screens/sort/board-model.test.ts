import { beforeEach, describe, expect, it } from 'vitest'
import type { GroupMember, GroupingProposal } from '@shared/grouping'
import {
  boardFromProposal,
  boardFromSaved,
  boardOrder,
  makeBoardReducer,
  mergeBoard,
  canDisband,
  canNewPile,
  canPutOnTop,
  canTakeOut,
  countLabel,
  createBoard,
  getPile,
  moveTargets,
  pileOf,
  selectionTileIds,
  titleOfPile,
  toSortBoard,
  undoLabel,
  redoLabel,
  type BoardAction,
  type BoardState
} from './board-model'

// The Sort board reducer — Figma B2 · Sort into piles (S2 to S8) and design/specs/pile-titles.md.

const member = (id: number, fileName: string, folder: string[] = []): GroupMember => ({
  mockupId: id,
  fileName,
  folderTrail: folder,
  coverPath: `/c/${id}.png`,
  isPrimary: false
})

/**
 * Pile "phones": 1 front (top), 2 side, 3 top, 4 back.   Pile "mugs": 5 a (top), 6 b, 7 c.
 * On its own: 8 cap_navy, 9 tote_red, 10 poster_a3.
 */
function fixture(): BoardState {
  const phones = ['phone_front', 'phone_side', 'phone_top', 'phone_back'].map((n, i) =>
    member(i + 1, `${n}.psd`, ['Phones'])
  )
  const mugs = ['mug_a', 'mug_b', 'mug_c'].map((n, i) => member(i + 5, `${n}.psd`))
  const alone = ['cap_navy', 'tote_red', 'poster_a3'].map((n, i) => member(i + 8, `${n}.psd`))
  const proposal: GroupingProposal = {
    batchId: 'b1',
    groups: [
      {
        id: 'phones',
        members: phones.map((m, i) => ({ ...m, isPrimary: i === 0 })),
        reason: 'folder'
      },
      { id: 'mugs', members: mugs.map((m, i) => ({ ...m, isPrimary: i === 0 })), reason: 'stem' }
    ],
    singletons: alone
  }
  return boardFromProposal(proposal)
}

let minted = 0
const boardReducer = makeBoardReducer(() => `p${++minted}`)
beforeEach(() => {
  minted = 0
})

const run = (state: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, state)
const members = (state: BoardState, pileId: string) => getPile(state, pileId)?.memberIds
const click = (id: number, mods: { meta?: boolean; shift?: boolean } = {}): BoardAction => ({
  type: 'click-tile',
  id,
  ...mods
})

describe('building a board', () => {
  it('puts each proposed pile in order with its top first, and the rest on their own', () => {
    const s = fixture()
    expect(s.piles.map((p) => [p.id, p.memberIds])).toEqual([
      ['phones', [1, 2, 3, 4]],
      ['mugs', [5, 6, 7]]
    ])
    expect(s.standalone).toEqual([8, 9, 10])
    expect(boardOrder(s)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('restores a saved board and leaves out piles of fewer than two', () => {
    const all = [1, 2, 3, 4].map((i) => member(i, `f${i}.psd`))
    const s = boardFromSaved(
      {
        batchId: 'b',
        groups: [
          { id: 'g', memberIds: [3, 1] },
          { id: 'lonely', memberIds: [4] }
        ],
        singletonIds: [2]
      },
      all
    )
    expect(s.piles).toEqual([{ id: 'g', memberIds: [3, 1] }])
    expect(s.standalone).toEqual([2, 4])
  })

  it('saves the board for Finish later in the same shape it confirms', () => {
    expect(toSortBoard(fixture(), 'b1')).toEqual({
      batchId: 'b1',
      groups: [
        { id: 'phones', memberIds: [1, 2, 3, 4] },
        { id: 'mugs', memberIds: [5, 6, 7] }
      ],
      singletonIds: [8, 9, 10]
    })
  })

  it('round-trips through save and restore', () => {
    const moved = run(fixture(), click(8), click(9, { meta: true }), {
      type: 'new-pile'
    })
    const saved = toSortBoard(moved, 'b1')
    const restored = boardFromSaved(
      saved,
      Object.values(moved.tiles).map((t) => member(t.id, t.fileName, t.folderTrail))
    )
    expect(toSortBoard(restored, 'b1')).toEqual(saved)
  })
})

describe('titles follow the members (pile-titles.md)', () => {
  it('titles a pile from one zip by the zip name', () => {
    const watch = (id: number, fileName: string, folder: string): GroupMember => ({
      ...member(id, fileName, ['Apple Watch Ultra Mockup', folder]),
      archive: 'Apple-Watch-Ultra-Mockup.zip',
      archiveTitle: 'Apple Watch Ultra Mockup'
    })
    const members = [
      watch(1, 'Apple Watch Ultra - Realistic, PSD.psd', 'Realistic'),
      watch(2, 'Apple Watch Ultra - Сlay, PSD.psd', 'Clay Version')
    ]
    const s = createBoard({ members, groups: [{ id: 'w', memberIds: [1, 2] }] })
    expect(titleOfPile(s, getPile(s, 'w')!)).toEqual({
      title: 'Apple Watch Ultra Mockup',
      source: 'folder'
    })
  })

  it('titles by the shared folder, then the shared filename start, then the top', () => {
    const s = fixture()
    expect(titleOfPile(s, getPile(s, 'phones')!)).toMatchObject({
      title: 'Phones',
      source: 'folder'
    })
    expect(titleOfPile(s, getPile(s, 'mugs')!)).toMatchObject({
      title: 'mug_…',
      source: 'filename',
      reason: 'similar names'
    })
    const made = run(s, click(8), click(10, { meta: true }), { type: 'new-pile' })
    expect(titleOfPile(made, getPile(made, 'p1')!)).toEqual({
      title: 'cap_navy.psd',
      source: 'primary'
    })
  })

  it('renames a top-titled pile straight away when another mockup goes on top', () => {
    const made = run(fixture(), click(8), click(10, { meta: true }), {
      type: 'new-pile'
    })
    const after = run(made, { type: 'put-on-top', tileId: 10 })
    expect(titleOfPile(after, getPile(after, 'p1')!).title).toBe('poster_a3.psd')
  })

  it('leaves folder and filename-start titles alone when the top changes', () => {
    const s = run(fixture(), { type: 'put-on-top', tileId: 3 }, { type: 'put-on-top', tileId: 6 })
    expect(titleOfPile(s, getPile(s, 'phones')!).title).toBe('Phones')
    expect(titleOfPile(s, getPile(s, 'mugs')!).title).toBe('mug_…')
  })

  it('re-titles when a move changes what the pile shares', () => {
    const s = run(fixture(), click(8), {
      type: 'move-to',
      destination: { kind: 'pile', pileId: 'phones' }
    })
    // cap_navy has no folder and no shared name start, so the folder title gives way to the top's name.
    expect(titleOfPile(s, getPile(s, 'phones')!)).toEqual({
      title: 'phone_front.psd',
      source: 'primary'
    })
  })

  it('uses the stashed top mockup’s title and says so', () => {
    const base = fixture()
    const s = { ...base, stashedTitles: { mugs: 'Blue mug' } }
    expect(titleOfPile(s, getPile(s, 'mugs')!)).toEqual({
      title: 'Blue mug',
      source: 'leader',
      reason: 'top mockup stashed'
    })
  })

  it('counts with "1 mockup" / "N mockups"', () => {
    expect(countLabel(getPile(fixture(), 'mugs')!)).toBe('3 mockups')
  })
})

describe('selection', () => {
  it('click selects one tile and replaces the selection (S2.1)', () => {
    const s = run(fixture(), click(1), click(6))
    expect(s.selectedTiles).toEqual([6])
  })

  it('⌘-click adds and removes one tile from any pile or the tray (S2.2)', () => {
    const s = run(fixture(), click(1), click(6, { meta: true }), click(9, { meta: true }))
    expect(s.selectedTiles).toEqual([1, 6, 9])
    expect(run(s, click(6, { meta: true })).selectedTiles).toEqual([1, 9])
  })

  it('⇧-click selects the range inside the pile from the anchor (S2.3)', () => {
    const s = run(fixture(), click(2), click(4, { shift: true }))
    expect(s.selectedTiles).toEqual([2, 3, 4])
  })

  it('⇧-click again moves the end of the range and keeps the anchor (S2.3)', () => {
    const s = run(fixture(), click(2), click(4, { shift: true }), click(3, { shift: true }))
    expect(s.selectedTiles).toEqual([2, 3])
    expect(run(s, click(1, { shift: true })).selectedTiles).toEqual([1, 2])
  })

  it('⇧-click works along the tray too', () => {
    const s = run(fixture(), click(8), click(10, { shift: true }))
    expect(s.selectedTiles).toEqual([8, 9, 10])
  })

  it('⇧-click into another pile just adds that tile (S2.E5)', () => {
    const s = run(fixture(), click(2), click(6, { shift: true }))
    expect(s.selectedTiles).toEqual([2, 6])
  })

  it('⇧-click with no anchor adds the tile', () => {
    expect(run(fixture(), click(3, { shift: true })).selectedTiles).toEqual([3])
  })

  it('⌘A selects every tile on the board (S2.E3)', () => {
    const s = run(fixture(), { type: 'select-all' })
    expect(s.selectedTiles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('select all in a pile selects just that pile’s tiles (S2.E3)', () => {
    expect(run(fixture(), { type: 'select-pile-tiles', pileId: 'mugs' }).selectedTiles).toEqual([
      5, 6, 7
    ])
  })

  it('clicking empty space clears the selection and moves nothing (S2.E4)', () => {
    const before = fixture()
    const s = run(before, click(1), click(2, { meta: true }), { type: 'click-empty' })
    expect(s.selectedTiles).toEqual([])
    expect(s.piles).toEqual(before.piles)
    expect(s.history).toHaveLength(0)
  })

  it('Esc clears the selection (S2.E4)', () => {
    expect(run(fixture(), click(1), { type: 'cancel' }).selectedTiles).toEqual([])
  })

  it('clicking a header selects the whole pile and no tiles (S7.1)', () => {
    const s = run(fixture(), click(1), { type: 'click-pile-header', pileId: 'mugs' })
    expect(s.selectedPiles).toEqual(['mugs'])
    expect(s.selectedTiles).toEqual([])
  })

  it('clicking a tile inside a selected pile selects just that tile (S7.1)', () => {
    const s = run(fixture(), { type: 'click-pile-header', pileId: 'mugs' }, click(6))
    expect(s.selectedTiles).toEqual([6])
    expect(s.selectedPiles).toEqual([])
  })

  it('⌘-click on headers selects several piles (S7.E3)', () => {
    const s = run(
      fixture(),
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'click-pile-header', pileId: 'mugs', meta: true }
    )
    expect(s.selectedPiles).toEqual(['phones', 'mugs'])
    expect(
      run(s, { type: 'click-pile-header', pileId: 'phones', meta: true }).selectedPiles
    ).toEqual(['mugs'])
  })

  it('right-clicking a tile outside the selection switches the selection to it (S4.E2)', () => {
    const s = run(fixture(), click(1), click(2, { meta: true }), click(3, { meta: true }), {
      type: 'context-tile',
      id: 9
    })
    expect(s.selectedTiles).toEqual([9])
  })

  it('right-clicking a tile inside the selection keeps the selection (S4.2)', () => {
    const s = run(fixture(), click(1), click(2, { meta: true }), { type: 'context-tile', id: 2 })
    expect(s.selectedTiles).toEqual([1, 2])
  })

  it('right-clicking a pile targets the whole pile (S4.E3)', () => {
    const s = run(fixture(), click(1), { type: 'context-pile', pileId: 'mugs' })
    expect(s.selectedPiles).toEqual(['mugs'])
    expect(s.selectedTiles).toEqual([])
  })

  it('ignores unknown ids', () => {
    const s = fixture()
    expect(run(s, click(99))).toBe(s)
    expect(run(s, { type: 'click-pile-header', pileId: 'nope' })).toBe(s)
  })
})

describe('marquee', () => {
  it('selects every tile it touches, across piles (S2.E1, S2.E2)', () => {
    const s = run(fixture(), { type: 'marquee', tileIds: [3, 4, 5, 8], headerPileIds: [] })
    expect(s.selectedTiles).toEqual([3, 4, 5, 8])
    expect(s.selectedPiles).toEqual([])
  })

  it('selects tiles, not the pile, when the box stops below the header (S7.E1)', () => {
    const s = run(fixture(), { type: 'marquee', tileIds: [5, 6, 7], headerPileIds: [] })
    expect(s.selectedTiles).toEqual([5, 6, 7])
    expect(s.selectedPiles).toEqual([])
  })

  it('selects the pile once the box covers all its tiles and reaches its header (S7.E2)', () => {
    const s = run(fixture(), { type: 'marquee', tileIds: [5, 6, 7], headerPileIds: ['mugs'] })
    expect(s.selectedPiles).toEqual(['mugs'])
    expect(s.selectedTiles).toEqual([])
  })

  it('does not select a pile whose header is reached but whose tiles are not all covered', () => {
    const s = run(fixture(), { type: 'marquee', tileIds: [5, 6], headerPileIds: ['mugs'] })
    expect(s.selectedPiles).toEqual([])
    expect(s.selectedTiles).toEqual([5, 6])
  })

  it('keeps loose tiles from other piles next to a whole pile', () => {
    const s = run(fixture(), { type: 'marquee', tileIds: [5, 6, 7, 1, 8], headerPileIds: ['mugs'] })
    expect(s.selectedPiles).toEqual(['mugs'])
    expect(s.selectedTiles).toEqual([1, 8])
  })

  it('selects two piles at once (S7.E3)', () => {
    const s = run(fixture(), {
      type: 'marquee',
      tileIds: [1, 2, 3, 4, 5, 6, 7],
      headerPileIds: ['phones', 'mugs']
    })
    expect(s.selectedPiles).toEqual(['phones', 'mugs'])
  })

  it('replaces the selection, or adds to it with ⌘ (S2.E1)', () => {
    const base = run(fixture(), click(10))
    expect(run(base, { type: 'marquee', tileIds: [1], headerPileIds: [] }).selectedTiles).toEqual([
      1
    ])
    expect(
      run(base, { type: 'marquee', tileIds: [1, 10], headerPileIds: [], additive: true })
        .selectedTiles
    ).toEqual([10, 1])
  })

  it('ignores tiles that are not on the board', () => {
    expect(
      run(fixture(), { type: 'marquee', tileIds: [99, 1], headerPileIds: [] }).selectedTiles
    ).toEqual([1])
  })
})

describe('dragging a tile', () => {
  it('grabbing an unselected tile selects it and carries only it (S3.1)', () => {
    const s = run(fixture(), click(1), { type: 'drag-start-tile', id: 9 })
    expect(s.selectedTiles).toEqual([9])
    expect(s.drag).toMatchObject({ kind: 'tiles', ids: [9], grabbed: 9 })
  })

  it('grabbing a selected tile picks up the whole selection, in board order (S3.4)', () => {
    const s = run(fixture(), click(9), click(2, { meta: true }), click(6, { meta: true }), {
      type: 'drag-start-tile',
      id: 9
    })
    expect(s.drag).toMatchObject({ kind: 'tiles', ids: [2, 6, 9], grabbed: 9 })
  })

  it('tracks what it is over, for the highlight and ghosts (S3.2, S3.5)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 8 },
      { type: 'drag-over', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(s.drag?.over).toEqual({ kind: 'pile', pileId: 'mugs' })
    expect(run(s, { type: 'drag-over', target: null }).drag?.over).toBeNull()
  })

  it('ignores drag-over when nothing is in hand', () => {
    const s = fixture()
    expect(run(s, { type: 'drag-over', target: { kind: 'standalone' } })).toBe(s)
  })

  it('joins the pile at the end, counts update, and one undo covers it (S3.3)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(members(s, 'mugs')).toEqual([5, 6, 7, 8])
    expect(s.standalone).toEqual([9, 10])
    expect(s.drag).toBeNull()
    expect(s.notice).toMatch(/Added 1 mockup to /)
    expect(run(s, { type: 'undo' }).piles).toEqual(fixture().piles)
  })

  it('a dropped selection joins at the end, stays selected, and undoes in one step (S3.6)', () => {
    const s = run(
      fixture(),
      click(8),
      click(9, { meta: true }),
      click(10, { meta: true }),
      { type: 'drag-start-tile', id: 9 },
      { type: 'drop', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(members(s, 'mugs')).toEqual([5, 6, 7, 8, 9, 10])
    expect(s.standalone).toEqual([])
    expect(s.selectedTiles).toEqual([8, 9, 10])
    const undone = run(s, { type: 'undo' })
    expect(undone.standalone).toEqual([8, 9, 10])
    expect(members(undone, 'mugs')).toEqual([5, 6, 7])
  })

  it('moves a tile from one pile to another', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 3 },
      { type: 'drop', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(members(s, 'phones')).toEqual([1, 2, 4])
    expect(members(s, 'mugs')).toEqual([5, 6, 7, 3])
  })

  it('does nothing when every dragged tile is already in the pile', () => {
    const before = fixture()
    const s = run(
      before,
      { type: 'drag-start-tile', id: 6 },
      { type: 'drop', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(s.piles).toEqual(before.piles)
    expect(s.history).toHaveLength(0)
    expect(s.drag).toBeNull()
  })

  it('dropping on On its own takes the tile out of its pile', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 3 },
      { type: 'drop', target: { kind: 'standalone' } }
    )
    expect(members(s, 'phones')).toEqual([1, 2, 4])
    expect(s.standalone).toEqual([8, 9, 10, 3])
  })

  it('dropping on a tile on its own starts a pile and that tile becomes the top (S5.1, S5.2)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'tile', tileId: 9 } }
    )
    expect(s.piles[0]).toEqual({ id: 'p1', memberIds: [9, 8] })
    expect(s.standalone).toEqual([10])
    expect(titleOfPile(s, s.piles[0]!).title).toBe('tote_red.psd')
  })

  it('a hand-made pile appears first on the board (S5.2)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'tile', tileId: 9 } }
    )
    expect(s.piles.map((p) => p.id)).toEqual(['p1', 'phones', 'mugs'])
  })

  it('dropping a selection on a tile starts a pile of all of them with the target on top (S5.E1)', () => {
    const s = run(
      fixture(),
      click(1),
      click(2, { meta: true }),
      click(5, { meta: true }),
      { type: 'drag-start-tile', id: 1 },
      { type: 'drop', target: { kind: 'tile', tileId: 10 } }
    )
    expect(members(s, 'p1')).toEqual([10, 1, 2, 5])
    expect(s.notice).toMatch(/New pile of 4 mockups/)
  })

  it('dropping on a tile that is in a pile joins that pile', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'tile', tileId: 6 } }
    )
    expect(members(s, 'mugs')).toEqual([5, 6, 7, 8])
  })

  it('dropping a tile on itself does nothing', () => {
    const before = fixture()
    const s = run(
      before,
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'tile', tileId: 8 } }
    )
    expect(s.piles).toEqual(before.piles)
    expect(s.history).toHaveLength(0)
  })
})

describe('tops and dissolving', () => {
  it('taking the top out promotes the next tile and the notice says so (S3.E1)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-tile', id: 1 },
      { type: 'drop', target: { kind: 'standalone' } }
    )
    expect(members(s, 'phones')).toEqual([2, 3, 4])
    expect(s.notice).toContain('phone_side.psd is now the top mockup')
  })

  it('a selection taking two tops names both new tops (S3.E3)', () => {
    const s = run(fixture(), click(1), click(5, { meta: true }), { type: 'take-out' })
    expect(members(s, 'phones')).toEqual([2, 3, 4])
    expect(members(s, 'mugs')).toEqual([6, 7])
    expect(s.notice).toContain('phone_side.psd and mug_b.psd are now the top mockups')
  })

  it('a pile down to one tile dissolves into On its own, and undo puts it back (S3.E2)', () => {
    const s = run(fixture(), click(5), click(6, { meta: true }), { type: 'take-out' })
    expect(getPile(s, 'mugs')).toBeUndefined()
    expect(s.standalone).toEqual([8, 9, 10, 5, 6, 7])
    const undone = run(s, { type: 'undo' })
    expect(members(undone, 'mugs')).toEqual([5, 6, 7])
    expect(undone.standalone).toEqual([8, 9, 10])
  })

  it('moving every tile out removes the empty pile (S3.E4)', () => {
    const s = run(fixture(), click(5), click(6, { meta: true }), click(7, { meta: true }), {
      type: 'move-to',
      destination: { kind: 'pile', pileId: 'phones' }
    })
    expect(s.piles.map((p) => p.id)).toEqual(['phones'])
    expect(members(s, 'phones')).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(run(s, { type: 'undo' }).piles.map((p) => p.id)).toEqual(['phones', 'mugs'])
  })

  it('dragging out of a two-tile pile leaves its last tile on its own', () => {
    const two = run(fixture(), click(8), click(9, { meta: true }), {
      type: 'new-pile'
    })
    const s = run(
      two,
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'standalone' } }
    )
    expect(getPile(s, 'p1')).toBeUndefined()
    expect(s.standalone).toContain(9)
  })

  it('a deselected pile id does not linger after its pile dissolves', () => {
    const two = run(fixture(), click(8), click(9, { meta: true }), {
      type: 'new-pile'
    })
    const s = run(two, { type: 'click-pile-header', pileId: 'p1' }, { type: 'take-out' })
    expect(s.selectedPiles).toEqual(['p1'])
    const gone = run(two, { type: 'click-tile', id: 8 }, { type: 'take-out' })
    expect(gone.selectedPiles).toEqual([])
  })
})

describe('esc and cancelling a drag', () => {
  it('Esc sends the stack back: nothing moves and the selection stays (S3.E5)', () => {
    const before = run(fixture(), click(8), click(9, { meta: true }), {
      type: 'drag-start-tile',
      id: 8
    })
    const s = run(before, { type: 'cancel' })
    expect(s.drag).toBeNull()
    expect(s.selectedTiles).toEqual([8, 9])
    expect(s.piles).toEqual(fixture().piles)
    expect(s.history).toHaveLength(0)
  })

  it('a second Esc then clears the selection', () => {
    const s = run(
      fixture(),
      click(8),
      { type: 'drag-start-tile', id: 8 },
      { type: 'cancel' },
      { type: 'cancel' }
    )
    expect(s.selectedTiles).toEqual([])
  })

  it('dropping somewhere that is not a pile, a tile or On its own sends it back (S3.E5)', () => {
    const s = run(
      fixture(),
      click(8),
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: null }
    )
    expect(s.piles).toEqual(fixture().piles)
    expect(s.selectedTiles).toEqual([8])
    expect(s.drag).toBeNull()
    expect(s.history).toHaveLength(0)
  })
})

describe('new pile (⌘G)', () => {
  it('makes a pile from the selection with the first selected tile on top (S5.3, S5.4)', () => {
    const s = run(fixture(), click(10), click(8, { meta: true }), click(9, { meta: true }), {
      type: 'new-pile'
    })
    expect(s.piles[0]).toEqual({ id: 'p1', memberIds: [10, 8, 9] })
    expect(s.standalone).toEqual([])
    expect(s.selectedTiles).toEqual([10, 8, 9])
  })

  it('uses the right-clicked tile as the top when told which (S5.4)', () => {
    const s = run(fixture(), click(10), click(8, { meta: true }), {
      type: 'new-pile',
      topId: 8
    })
    expect(members(s, 'p1')).toEqual([8, 10])
  })

  it('ignores a top that is not selected', () => {
    const s = run(fixture(), click(10), click(8, { meta: true }), {
      type: 'new-pile',
      topId: 1
    })
    expect(members(s, 'p1')).toEqual([10, 8])
  })

  it('pulls tiles from different piles and shrinks the piles they left (S5.E3)', () => {
    const s = run(fixture(), click(2), click(6, { meta: true }), click(7, { meta: true }), {
      type: 'new-pile'
    })
    expect(members(s, 'p1')).toEqual([2, 6, 7])
    expect(members(s, 'phones')).toEqual([1, 3, 4])
    expect(getPile(s, 'mugs')).toBeUndefined()
    expect(s.standalone).toContain(5)
  })

  it('needs two or more tiles (S4.1)', () => {
    const one = run(fixture(), click(8))
    expect(canNewPile(one)).toBe(false)
    expect(run(one, { type: 'new-pile' })).toBe(one)
  })

  it('is off for a selection that is exactly one whole pile (S5.E2)', () => {
    const whole = run(fixture(), { type: 'select-pile-tiles', pileId: 'mugs' })
    expect(canNewPile(whole)).toBe(false)
    expect(run(whole, { type: 'new-pile' })).toBe(whole)
    expect(whole.history).toHaveLength(0)
  })

  it('is on for a whole pile plus a tile', () => {
    const s = run(
      fixture(),
      { type: 'select-pile-tiles', pileId: 'mugs' },
      click(8, { meta: true })
    )
    expect(canNewPile(s)).toBe(true)
  })
})

describe('disband (⇧⌘G)', () => {
  it('moves the pile’s tiles to On its own, still selected, so ⌘G re-piles them (S8.E2)', () => {
    const s = run(fixture(), { type: 'click-pile-header', pileId: 'mugs' }, { type: 'disband' })
    expect(getPile(s, 'mugs')).toBeUndefined()
    expect(s.standalone).toEqual([8, 9, 10, 5, 6, 7])
    expect(s.selectedTiles).toEqual([5, 6, 7])
    expect(s.notice).toBe('Pile broken up.')
    const again = run(s, { type: 'new-pile' })
    expect(members(again, 'p1')).toEqual([5, 6, 7])
  })

  it('works on a pile with any of its tiles selected (S8.E2)', () => {
    const s = run(fixture(), click(6), { type: 'disband' })
    expect(getPile(s, 'mugs')).toBeUndefined()
    expect(members(s, 'phones')).toEqual([1, 2, 3, 4])
  })

  it('disbands several selected piles at once (S7.E3)', () => {
    const s = run(
      fixture(),
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'click-pile-header', pileId: 'mugs', meta: true },
      { type: 'disband' }
    )
    expect(s.piles).toEqual([])
    expect(s.standalone).toHaveLength(10)
  })

  it('is undone exactly, top mockup included (S8.E1)', () => {
    const reordered = run(fixture(), { type: 'put-on-top', tileId: 3 })
    const s = run(
      reordered,
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'disband' },
      { type: 'undo' }
    )
    expect(members(s, 'phones')).toEqual([3, 1, 2, 4])
    expect(s.standalone).toEqual([8, 9, 10])
  })

  it('dropping a pile on On its own disbands it with its tiles selected (S8.E3)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-pile', pileId: 'mugs' },
      { type: 'drop', target: { kind: 'standalone' } }
    )
    expect(getPile(s, 'mugs')).toBeUndefined()
    expect(s.selectedTiles).toEqual([5, 6, 7])
  })

  it('does nothing when nothing is selected', () => {
    const s = fixture()
    expect(canDisband(s)).toBe(false)
    expect(run(s, { type: 'disband' })).toEqual({ ...s, drag: null })
    expect(run(s, { type: 'disband' }).history).toHaveLength(0)
  })

  it('is not offered for tiles on their own', () => {
    expect(canDisband(run(fixture(), click(8)))).toBe(false)
  })
})

describe('merge', () => {
  it('dragging a pile onto another merges it into that pile; the target’s top stays (S7.2, S7.3)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-pile', pileId: 'phones' },
      { type: 'drop', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(s.piles.map((p) => p.id)).toEqual(['mugs'])
    expect(members(s, 'mugs')).toEqual([5, 6, 7, 1, 2, 3, 4])
  })

  it('keeps the merged pile selected so it can be dragged on, and undo splits them (S7.4)', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-pile', pileId: 'phones' },
      { type: 'drop', target: { kind: 'pile', pileId: 'mugs' } }
    )
    expect(s.selectedPiles).toEqual(['mugs'])
    const undone = run(s, { type: 'undo' })
    expect(undone.piles).toEqual(fixture().piles)
  })

  it('dropping a pile on a tile inside another pile merges into that pile', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-pile', pileId: 'phones' },
      { type: 'drop', target: { kind: 'tile', tileId: 6 } }
    )
    expect(s.piles.map((p) => p.id)).toEqual(['mugs'])
  })

  it('dropping a pile on itself does nothing', () => {
    const s = run(
      fixture(),
      { type: 'drag-start-pile', pileId: 'phones' },
      { type: 'drop', target: { kind: 'pile', pileId: 'phones' } }
    )
    expect(s.piles).toEqual(fixture().piles)
    expect(s.history).toHaveLength(0)
  })

  it('merges selected piles into the target from the menu (S7.E4)', () => {
    const s = run(
      fixture(),
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'merge', targetId: 'mugs' }
    )
    expect(members(s, 'mugs')).toEqual([5, 6, 7, 1, 2, 3, 4])
  })

  it('merging two selected piles goes into the one selected first, whose top stays (S7.E3)', () => {
    const s = run(
      fixture(),
      { type: 'click-pile-header', pileId: 'mugs' },
      { type: 'click-pile-header', pileId: 'phones', meta: true },
      { type: 'merge', targetId: 'mugs' }
    )
    expect(members(s, 'mugs')?.[0]).toBe(5)
    expect(s.piles).toHaveLength(1)
  })

  it('dragging two selected piles by one header merges both into the target', () => {
    const three = run(fixture(), click(8), click(9, { meta: true }), {
      type: 'new-pile'
    })
    const s = run(
      three,
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'click-pile-header', pileId: 'mugs', meta: true },
      { type: 'drag-start-pile', pileId: 'mugs' },
      { type: 'drop', target: { kind: 'pile', pileId: 'p1' } }
    )
    expect(s.piles.map((p) => p.id)).toEqual(['p1'])
    expect(members(s, 'p1')).toHaveLength(9)
  })
})

describe('put on top', () => {
  it('moves the tile to the front of its pile (S6.1, S6.2)', () => {
    const s = run(fixture(), click(3), { type: 'put-on-top' })
    expect(members(s, 'phones')).toEqual([3, 1, 2, 4])
    expect(s.notice).toBe('phone_top.psd is now the top mockup.')
  })

  it('is off for several tiles, tiles on their own, and the tile already on top (S4.2)', () => {
    expect(canPutOnTop(run(fixture(), click(2), click(3, { meta: true })))).toBe(false)
    expect(canPutOnTop(run(fixture(), click(8)))).toBe(false)
    expect(canPutOnTop(run(fixture(), click(1)))).toBe(false)
    expect(canPutOnTop(run(fixture(), click(3)))).toBe(true)
  })

  it('does nothing for a tile that is on its own', () => {
    const s = fixture()
    expect(run(s, { type: 'put-on-top', tileId: 8 })).toBe(s)
  })

  it('is undone, restoring the old top', () => {
    const s = run(fixture(), { type: 'put-on-top', tileId: 4 }, { type: 'undo' })
    expect(members(s, 'phones')).toEqual([1, 2, 3, 4])
  })
})

describe('move to ▸ and take out (menu)', () => {
  it('lists every pile that does not already hold all the selected tiles, then On its own and New pile (S4.3)', () => {
    const s = run(fixture(), click(6), click(7, { meta: true }))
    const targets = moveTargets(s)
    expect(targets.piles.map((p) => p.pileId)).toEqual(['phones'])
    expect(targets.piles[0]).toMatchObject({ title: 'Phones', count: 4 })
    expect(targets.standalone).toBe(true)
    expect(targets.newPile).toBe(true)
  })

  it('leaves out On its own when every selected tile is already there', () => {
    expect(moveTargets(run(fixture(), click(8), click(9, { meta: true }))).standalone).toBe(false)
  })

  it('leaves out New pile for a single tile', () => {
    expect(moveTargets(run(fixture(), click(8))).newPile).toBe(false)
  })

  it('moves the selection to a pile, to On its own, or to a new pile (S4.3)', () => {
    const base = run(fixture(), click(6), click(8, { meta: true }))
    expect(
      members(
        run(base, { type: 'move-to', destination: { kind: 'pile', pileId: 'phones' } }),
        'phones'
      )
    ).toEqual([1, 2, 3, 4, 6, 8])
    expect(run(base, { type: 'move-to', destination: { kind: 'standalone' } }).standalone).toEqual([
      8, 9, 10, 6
    ])
    expect(
      members(run(base, { type: 'move-to', destination: { kind: 'new-pile' } }), 'p1')
    ).toEqual([6, 8])
  })

  it('moves a whole selected pile’s tiles when piles are selected', () => {
    const s = run(
      fixture(),
      { type: 'click-pile-header', pileId: 'mugs' },
      { type: 'move-to', destination: { kind: 'pile', pileId: 'phones' } }
    )
    expect(members(s, 'phones')).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(selectionTileIds(run(fixture(), { type: 'click-pile-header', pileId: 'mugs' }))).toEqual(
      [5, 6, 7]
    )
  })

  it('take out is off for tiles already on their own (S4.2)', () => {
    expect(canTakeOut(run(fixture(), click(8)))).toBe(false)
    expect(canTakeOut(run(fixture(), click(2)))).toBe(true)
    const s = run(fixture(), click(8))
    expect(run(s, { type: 'take-out' }).history).toHaveLength(0)
  })
})

describe('undo', () => {
  it('names the last change for the board menu (S4.E4)', () => {
    expect(undoLabel(fixture())).toBeNull()
    expect(undoLabel(run(fixture(), click(3), { type: 'put-on-top' }))).toBe('Put on top')
    expect(undoLabel(run(fixture(), click(2), { type: 'take-out' }))).toBe('Take 1 mockup out')
  })

  it('steps back one change at a time, restoring selection too', () => {
    const one = run(fixture(), click(3), { type: 'put-on-top' })
    const two = run(one, click(8), click(9, { meta: true }), { type: 'new-pile' })
    const back = run(two, { type: 'undo' })
    expect(back.piles).toEqual(one.piles)
    expect(back.selectedTiles).toEqual([8, 9])
    expect(run(back, { type: 'undo' }).piles).toEqual(fixture().piles)
    expect(run(back, { type: 'undo' }, { type: 'undo' }).history).toHaveLength(0)
  })

  it('does nothing with nothing to undo', () => {
    const s = fixture()
    expect(run(s, { type: 'undo' })).toBe(s)
  })

  it('selection changes alone are not undoable', () => {
    expect(
      run(fixture(), click(1), click(2, { meta: true }), { type: 'select-all' }).history
    ).toHaveLength(0)
  })

  it('clears the notice and anything in hand', () => {
    const s = run(
      fixture(),
      click(3),
      { type: 'put-on-top' },
      { type: 'drag-start-tile', id: 8 },
      { type: 'undo' }
    )
    expect(s.notice).toBeNull()
    expect(s.drag).toBeNull()
  })

  it('keeps a bounded history', () => {
    let s = fixture()
    for (let i = 0; i < 130; i++) s = run(s, { type: 'put-on-top', tileId: i % 2 ? 1 : 2 })
    expect(s.history.length).toBeLessThanOrEqual(100)
  })

  it('dismissing the notice leaves the undo available', () => {
    const s = run(fixture(), click(3), { type: 'put-on-top' }, { type: 'dismiss-notice' })
    expect(s.notice).toBeNull()
    expect(undoLabel(s)).toBe('Put on top')
  })
})

describe('redo (⇧⌘Z, undo.md)', () => {
  it('puts an undone change back, selection too, and names it', () => {
    const done = run(fixture(), click(8), click(9, { meta: true }), { type: 'new-pile' })
    const undone = run(done, { type: 'undo' })
    expect(redoLabel(undone)).toBe('New pile')
    const redone = run(undone, { type: 'redo' })
    expect(redone.piles).toEqual(done.piles)
    expect(redone.standalone).toEqual(done.standalone)
    expect(redone.selectedTiles).toEqual(done.selectedTiles)
    expect(undoLabel(redone)).toBe('New pile')
    expect(redoLabel(redone)).toBeNull()
  })

  it('walks forward through several undone changes in order', () => {
    const one = run(fixture(), click(3), { type: 'put-on-top' })
    const two = run(one, click(8), click(9, { meta: true }), { type: 'new-pile' })
    const back = run(two, { type: 'undo' }, { type: 'undo' })
    expect(run(back, { type: 'redo' }).piles).toEqual(one.piles)
    expect(run(back, { type: 'redo' }, { type: 'redo' }).piles).toEqual(two.piles)
  })

  it('a new change clears what was waiting to be redone', () => {
    const undone = run(fixture(), click(3), { type: 'put-on-top' }, { type: 'undo' })
    const changed = run(undone, click(2), { type: 'take-out' })
    expect(redoLabel(changed)).toBeNull()
    expect(run(changed, { type: 'redo' })).toBe(changed)
  })

  it('does nothing with nothing to redo', () => {
    const s = fixture()
    expect(run(s, { type: 'redo' })).toBe(s)
  })
})

describe('invariants', () => {
  const everyTile = (s: BoardState) =>
    boardOrder(s)
      .slice()
      .sort((a, b) => a - b)
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('keeps every tile exactly once through a long run of edits', () => {
    const script: BoardAction[] = [
      click(1),
      click(5, { meta: true }),
      { type: 'new-pile' },
      { type: 'drag-start-tile', id: 8 },
      { type: 'drop', target: { kind: 'pile', pileId: 'p1' } },
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'merge', targetId: 'mugs' },
      click(2),
      click(3, { shift: true }),
      { type: 'take-out' },
      { type: 'select-all' },
      { type: 'disband' },
      { type: 'undo' },
      { type: 'undo' }
    ]
    let s = fixture()
    for (const action of script) {
      s = run(s, action)
      expect(everyTile(s)).toEqual(ids)
      for (const pile of s.piles) expect(pile.memberIds.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('never leaves a pile with fewer than two tiles', () => {
    const s = run(fixture(), click(5), click(6, { meta: true }), click(7, { meta: true }), {
      type: 'take-out'
    })
    expect(s.piles.every((p) => p.memberIds.length >= 2)).toBe(true)
    expect(pileOf(s, 5)).toBeUndefined()
  })

  it('does not mutate earlier states', () => {
    const before = fixture()
    const frozen = JSON.stringify(before)
    run(before, click(1), { type: 'take-out' }, { type: 'disband' }, { type: 'select-all' })
    expect(JSON.stringify(before)).toBe(frozen)
  })
})

describe('a board opened on a few, put back into the whole (Sort 3, F-049)', () => {
  const fresh = () => 'fresh'

  it('moves the few to where they are now and leaves the rest as it was', () => {
    const whole = {
      batchId: 'to-sort',
      groups: [
        { id: 'phones', memberIds: [1, 2, 3, 4] },
        { id: 'mugs', memberIds: [5, 6] }
      ],
      singletonIds: [7, 8]
    }
    const part = {
      batchId: 'to-sort',
      groups: [{ id: 'mine', memberIds: [8, 5] }],
      singletonIds: [2]
    }
    expect(mergeBoard(whole, part, fresh)).toEqual({
      batchId: 'to-sort',
      groups: [
        { id: 'phones', memberIds: [1, 3, 4] },
        { id: 'mine', memberIds: [8, 5] }
      ],
      singletonIds: [7, 6, 2]
    })
  })

  it('gives the part of a split pile a fresh id, so two piles never share one', () => {
    const whole = {
      batchId: 'to-sort',
      groups: [{ id: 'phones', memberIds: [1, 2, 3, 4] }],
      singletonIds: []
    }
    const part = {
      batchId: 'to-sort',
      groups: [{ id: 'phones', memberIds: [2, 3] }],
      singletonIds: []
    }
    expect(mergeBoard(whole, part, fresh).groups).toEqual([
      { id: 'phones', memberIds: [1, 4] },
      { id: 'fresh', memberIds: [2, 3] }
    ])
  })

  it('keeps a pile’s id when the part took all of it', () => {
    const whole = {
      batchId: 'to-sort',
      groups: [{ id: 'phones', memberIds: [1, 2] }],
      singletonIds: [3]
    }
    const part = {
      batchId: 'to-sort',
      groups: [{ id: 'phones', memberIds: [2, 1] }],
      singletonIds: []
    }
    expect(mergeBoard(whole, part, fresh)).toEqual({
      batchId: 'to-sort',
      groups: [{ id: 'phones', memberIds: [2, 1] }],
      singletonIds: [3]
    })
  })
})
