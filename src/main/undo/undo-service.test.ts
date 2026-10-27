import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UndoState } from '@shared/ipc/undo'
import { createSettingsStore } from '../settings'
import type { UndoMenuItems } from './menu-items'
import type { DataOp } from './ops'
import type { OpRunner } from './undo-history'
import { createUndoService } from './undo-service'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ds-undo-service-'))
  const settings = createSettingsStore(dir)
  const ran: DataOp[] = []
  const data: OpRunner<DataOp> = {
    run: (op) => {
      ran.push(op)
      return { ok: true }
    }
  }
  const pushes: UndoState[] = []
  const menus: UndoMenuItems[] = []
  const editField = vi.fn()
  const undo = createUndoService({
    data,
    settings,
    push: (state) => pushes.push(state),
    menu: (items) => menus.push(items),
    editField
  })
  return { dir, settings, ran, pushes, menus, editField, undo }
}

/** A trash of mockup `id`, as an import's undo records it. */
const trashRecord = (id: number) => ({
  label: 'Move to Trash',
  undo: { kind: 'restore' as const, payload: { ids: [id] } },
  redo: { kind: 'trash' as const, payload: { ids: [id], origin: 'import' as const } },
  targets: [{ kind: 'mockup' as const, id }]
})

describe('the undo service', () => {
  it('pushes the next labels and the entries after every change, and names the menu items', async () => {
    const { undo, pushes, menus } = setup()
    const id = undo.record(trashRecord(1))!

    expect(pushes.at(-1)).toEqual({ undoLabel: 'Move to Trash', entries: [{ id }] })
    expect(menus.at(-1)).toEqual({
      undo: { label: 'Undo Move to Trash', enabled: true },
      redo: { label: 'Redo', enabled: false }
    })

    await undo.history.undo()
    expect(pushes.at(-1)).toEqual({ redoLabel: 'Move to Trash', entries: [] })
    expect(menus.at(-1)?.redo).toEqual({ label: 'Redo Move to Trash', enabled: true })
  })

  it('runs data’s ops through data’s runner', async () => {
    const { undo, ran } = setup()
    undo.record(trashRecord(4))
    await undo.history.undo()
    expect(ran).toEqual([{ kind: 'restore', payload: { ids: [4] } }])
  })

  it('records nothing for an action that changed nothing', () => {
    const { undo, pushes } = setup()
    expect(undo.record(null)).toBeUndefined()
    expect(pushes).toEqual([])
  })

  it('reads plain Undo and Redo while a field or a flow has ⌘Z, and names them again after', () => {
    const { undo, menus } = setup()
    undo.record(trashRecord(1))
    undo.setContext('field')
    expect(menus.at(-1)).toEqual({
      undo: { label: 'Undo', enabled: true },
      redo: { label: 'Redo', enabled: true }
    })
    undo.setContext('app')
    expect(menus.at(-1)?.undo.label).toBe('Undo Move to Trash')
  })

  it('leaves the label out of the push for a toast’s out-of-order undo', async () => {
    const { undo, pushes } = setup()
    const older = undo.record(trashRecord(1))!
    undo.record(trashRecord(2))
    await undo.history.undoEntry(older)
    expect(pushes.at(-1)?.undoLabel).toBeUndefined()
  })

  it('keeps Discard your changes for the window: undo reopens the editor, redo discards again', async () => {
    const { undo, ran } = setup()
    const values = { title: 'Tote bag', description: 'Canvas', tagIds: [3] }
    const id = undo.recordDiscard(7, values)

    expect(await undo.history.undoEntry(id)).toEqual({
      status: 'done',
      label: 'Discard changes',
      renderer: { kind: 'reopen-editor', mockupId: 7, values }
    })
    expect(await undo.history.redo()).toEqual({
      status: 'done',
      label: 'Discard changes',
      renderer: { kind: 'discard-editor', mockupId: 7 }
    })
    expect(ran).toEqual([])
  })

  it('a stash folder change waiting for the restart is undone by cancelling it, and redone', async () => {
    const { undo, settings, dir } = setup()
    const pending = {
      path: '/Volumes/Studio/Stash',
      mode: 'move' as const,
      oldRoot: join(dir, 'Library')
    }
    settings.update({ pendingStash: pending })
    undo.record(undo.pendingStashRecord(null, pending))

    await undo.history.undo()
    expect(settings.get().pendingStash).toBeNull()
    await undo.history.redo()
    expect(settings.get().pendingStash).toEqual(pending)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a field’s own undo and redo go to the window', () => {
    const { undo, editField } = setup()
    undo.editField('undo')
    undo.editField('redo')
    expect(editField.mock.calls).toEqual([['undo'], ['redo']])
  })
})
