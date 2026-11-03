import { describe, expect, it } from 'vitest'
import type { GroupMember, GroupingProposal } from '@shared/grouping'
import {
  boardFromProposal,
  makeBoardReducer,
  type BoardAction,
  type BoardState
} from './board-model'
import { buildMenu, type MenuRow } from './menu-model'

// The menus of the Sort board — Figma S4, S7.E3, S7.E4, S8.1.

const member = (id: number, fileName: string, folder: string[] = []): GroupMember => ({
  mockupId: id,
  fileName,
  folderTrail: folder,
  coverPath: `/c/${id}.png`,
  isPrimary: false
})

/** Pile "phones": 1 to 4. Pile "mugs": 5 to 7. On its own: 8, 9, 10. */
function fixture(): BoardState {
  const phones = [1, 2, 3, 4].map((i) => member(i, `phone_${i}.psd`, ['Phones']))
  const mugs = [5, 6, 7].map((i) => member(i, `mug_${i}.psd`))
  const alone = [8, 9, 10].map((i) => member(i, `solo_${i}.psd`))
  const proposal: GroupingProposal = {
    batchId: 'b',
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

const run = (state: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, state)
const labels = (rows: MenuRow[]) =>
  rows.filter((r) => r.type !== 'divider').map((r) => (r as { label: string }).label)
const row = (rows: MenuRow[], key: string) =>
  rows.find((r) => r.type !== 'divider' && r.key === key)!
const enabled = (rows: MenuRow[], key: string) =>
  !(row(rows, key) as { disabled?: boolean }).disabled

describe('tile menu', () => {
  it('right-clicking one tile offers Put on top, Move to and Take out; New pile is disabled (S4.1)', () => {
    const s = run(fixture(), { type: 'context-tile', id: 3 })
    const rows = buildMenu(s, { kind: 'tile', tileId: 3 })
    expect(labels(rows)).toEqual(['Put on top', 'Move to', 'Take out of pile', 'New pile'])
    expect(enabled(rows, 'put-on-top')).toBe(true)
    expect(enabled(rows, 'take-out')).toBe(true)
    expect(enabled(rows, 'new-pile')).toBe(false)
  })

  it('disables Put on top for the top tile (S4.1)', () => {
    const rows = buildMenu(run(fixture(), { type: 'context-tile', id: 1 }), {
      kind: 'tile',
      tileId: 1
    })
    expect(enabled(rows, 'put-on-top')).toBe(false)
  })

  it('disables Put on top and Take out for a tile on its own (S4.E2)', () => {
    const rows = buildMenu(run(fixture(), { type: 'context-tile', id: 9 }), {
      kind: 'tile',
      tileId: 9
    })
    expect(enabled(rows, 'put-on-top')).toBe(false)
    expect(enabled(rows, 'take-out')).toBe(false)
    expect(enabled(rows, 'move')).toBe(true)
  })

  it('leads with New pile from N mockups for a selection, and disables Put on top (S4.2)', () => {
    const s = run(
      fixture(),
      { type: 'click-tile', id: 8 },
      { type: 'click-tile', id: 9, meta: true },
      { type: 'click-tile', id: 2, meta: true },
      { type: 'context-tile', id: 2 }
    )
    const rows = buildMenu(s, { kind: 'tile', tileId: 2 })
    expect(labels(rows)).toEqual([
      'New pile from 3 mockups',
      'Put on top',
      'Move 3 to',
      'Take 3 out of piles'
    ])
    expect(row(rows, 'new-pile')).toMatchObject({ shortcut: '⌘G' })
    expect(enabled(rows, 'new-pile')).toBe(true)
    expect(enabled(rows, 'put-on-top')).toBe(false)
  })

  it('the action of New pile makes a pile with a placeholder id for the screen to fill', () => {
    const s = run(
      fixture(),
      { type: 'click-tile', id: 8 },
      { type: 'click-tile', id: 9, meta: true }
    )
    const rows = buildMenu(s, { kind: 'tile', tileId: 8 })
    expect(row(rows, 'new-pile')).toMatchObject({ action: { type: 'new-pile' } })
  })

  it('lists every pile, On its own and New pile under Move to, by title and count (S4.3)', () => {
    const s = run(
      fixture(),
      { type: 'click-tile', id: 8 },
      { type: 'click-tile', id: 6, meta: true }
    )
    const move = row(buildMenu(s, { kind: 'tile', tileId: 8 }), 'move')
    expect(move.type).toBe('sub')
    if (move.type !== 'sub') return
    expect(move.items.map((i) => i.label)).toEqual([
      'Phones · 4',
      'mug_… · 3',
      'On its own',
      'New pile'
    ])
  })

  it('leaves out a pile that already holds every selected tile (S4.3)', () => {
    const s = run(
      fixture(),
      { type: 'click-tile', id: 5 },
      { type: 'click-tile', id: 6, meta: true }
    )
    const move = row(buildMenu(s, { kind: 'tile', tileId: 5 }), 'move')
    if (move.type !== 'sub') throw new Error('not a submenu')
    expect(move.items.map((i) => i.label)).toEqual(['Phones · 4', 'On its own', 'New pile'])
  })

  it('a Move to item moves the selection there', () => {
    const s = run(fixture(), { type: 'context-tile', id: 8 })
    const move = row(buildMenu(s, { kind: 'tile', tileId: 8 }), 'move')
    if (move.type !== 'sub') throw new Error('not a submenu')
    const after = boardReducer(s, move.items[0]!.action)
    expect(after.piles.find((p) => p.id === 'phones')?.memberIds).toEqual([1, 2, 3, 4, 8])
  })
})

describe('pile menu', () => {
  it('offers Select all, Merge into and Disband for one pile (S4.E3, S8.1)', () => {
    const s = run(fixture(), { type: 'context-pile', pileId: 'mugs' })
    const rows = buildMenu(s, { kind: 'pile', pileId: 'mugs' })
    expect(labels(rows)).toEqual(['Select all in pile', 'Merge into', 'Disband pile'])
    expect(row(rows, 'disband')).toMatchObject({ shortcut: '⇧⌘G', destructive: true })
  })

  it('Merge into lists the other piles and merges this one into the pick (S7.E4)', () => {
    const s = run(fixture(), { type: 'context-pile', pileId: 'mugs' })
    const sub = row(buildMenu(s, { kind: 'pile', pileId: 'mugs' }), 'merge-into')
    if (sub.type !== 'sub') throw new Error('not a submenu')
    expect(sub.items.map((i) => i.label)).toEqual(['Phones · 4'])
    const after = boardReducer(s, sub.items[0]!.action)
    expect(after.piles.map((p) => p.id)).toEqual(['phones'])
    expect(after.piles[0]!.memberIds.slice(0, 4)).toEqual([1, 2, 3, 4])
  })

  it('disables Merge into when there is no other pile', () => {
    const one = run(
      fixture(),
      { type: 'click-tile', id: 5 },
      { type: 'click-tile', id: 6, meta: true },
      { type: 'click-tile', id: 7, meta: true }
    )
    const solo = run(
      one,
      { type: 'move-to', destination: { kind: 'pile', pileId: 'phones' } },
      { type: 'context-pile', pileId: 'phones' }
    )
    expect(enabled(buildMenu(solo, { kind: 'pile', pileId: 'phones' }), 'merge-into')).toBe(false)
  })

  it('offers Merge N piles and Disband N piles for several selected piles (S7.E3)', () => {
    const s = run(
      fixture(),
      { type: 'click-pile-header', pileId: 'phones' },
      { type: 'click-pile-header', pileId: 'mugs', meta: true }
    )
    const rows = buildMenu(s, { kind: 'pile', pileId: 'phones' })
    expect(labels(rows)).toEqual(['Merge 2 piles', 'Disband 2 piles'])
    const merged = boardReducer(s, (row(rows, 'merge') as { action: BoardAction }).action)
    expect(merged.piles.map((p) => p.id)).toEqual(['phones'])
  })

  it('Disband undoes cleanly', () => {
    const s = run(fixture(), { type: 'context-pile', pileId: 'mugs' })
    const rows = buildMenu(s, { kind: 'pile', pileId: 'mugs' })
    const after = run(boardReducer(s, (row(rows, 'disband') as { action: BoardAction }).action), {
      type: 'undo'
    })
    expect(after.piles.map((p) => p.id)).toEqual(['phones', 'mugs'])
  })
})

describe('board menu', () => {
  it('offers Select all, and Undo naming the last change (S4.E4)', () => {
    const fresh = buildMenu(fixture(), { kind: 'board' })
    expect(labels(fresh)).toEqual(['Select all', 'Undo'])
    expect(enabled(fresh, 'undo')).toBe(false)
    const changed = run(fixture(), { type: 'click-tile', id: 3 }, { type: 'put-on-top' })
    const rows = buildMenu(changed, { kind: 'board' })
    expect(labels(rows)).toEqual(['Select all', 'Undo Put on top'])
    expect(enabled(rows, 'undo')).toBe(true)
  })
})

describe('copy', () => {
  it('uses pile, Top and mockup words, never leader, primary, Duplicate or Finder', () => {
    const states = [
      run(fixture(), { type: 'context-tile', id: 3 }),
      run(fixture(), { type: 'context-pile', pileId: 'mugs' }),
      fixture()
    ]
    const all = [
      buildMenu(states[0]!, { kind: 'tile', tileId: 3 }),
      buildMenu(states[1]!, { kind: 'pile', pileId: 'mugs' }),
      buildMenu(states[2]!, { kind: 'board' })
    ].flatMap(labels)
    expect(all.join(' ')).not.toMatch(/leader|primary|duplicate|finder|—/i)
  })
})
