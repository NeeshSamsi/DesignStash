import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { createSettingsStore } from '../settings'
import type { UndoMenuItems } from '../undo/menu-items'
import { createUndoService, type UndoService } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { registerUndoHandlers } from './undo'

const call = async <T = unknown>(channel: string, args?: unknown): Promise<T> => {
  const res = (await handlers.get(channel)!(null, args)) as IpcResult<T>
  if (!res.success) throw new Error(`${channel}: ${res.error.message}`)
  return res.data
}

let dir: string
let undo: UndoService
let menus: UndoMenuItems[]
let editField: Mock<(direction: 'undo' | 'redo') => void>
const ran: unknown[] = []

beforeEach(() => {
  handlers.clear()
  ran.length = 0
  menus = []
  editField = vi.fn<(direction: 'undo' | 'redo') => void>()
  dir = mkdtempSync(join(tmpdir(), 'ds-undo-ipc-'))
  undo = createUndoService({
    data: {
      run: (op) => {
        ran.push(op)
        return { ok: true }
      }
    },
    settings: createSettingsStore(dir),
    push: () => {},
    menu: (items) => menus.push(items),
    editField
  })
  registerUndoHandlers({ undo } as unknown as HandlerContext)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const trash = (id: number) =>
  undo.record({
    label: 'Move to Trash',
    undo: { kind: 'restore', payload: { ids: [id] } },
    redo: { kind: 'trash', payload: { ids: [id], origin: 'import' } },
    targets: [{ kind: 'mockup', id }]
  })!

describe('undo handlers', () => {
  it('undo:run and redo:run walk the app history', async () => {
    trash(1)
    expect(await call(IPC_CHANNELS.UNDO_RUN)).toEqual({ status: 'done', label: 'Move to Trash' })
    expect(await call(IPC_CHANNELS.REDO_RUN)).toEqual({ status: 'done', label: 'Move to Trash' })
    expect(ran).toEqual([
      { kind: 'restore', payload: { ids: [1] } },
      { kind: 'trash', payload: { ids: [1], origin: 'import' } }
    ])
  })

  it('says when there is nothing to undo', async () => {
    expect(await call(IPC_CHANNELS.UNDO_RUN)).toEqual({ status: 'empty' })
  })

  it('undo:entry undoes a toast’s own entry, and says when a newer action blocks it', async () => {
    const older = trash(1)
    const newer = trash(1)
    expect(await call(IPC_CHANNELS.UNDO_ENTRY, { id: older })).toEqual({
      status: 'blocked',
      label: 'Move to Trash',
      blockedBy: newer
    })
    expect(await call(IPC_CHANNELS.UNDO_ENTRY, { id: newer })).toEqual({
      status: 'done',
      label: 'Move to Trash'
    })
  })

  it('undo:context sets the Edit menu’s labels', async () => {
    trash(1)
    await call(IPC_CHANNELS.UNDO_CONTEXT, { context: 'flow' })
    expect(menus.at(-1)?.undo.label).toBe('Undo')
    await call(IPC_CHANNELS.UNDO_CONTEXT, { context: 'app' })
    expect(menus.at(-1)?.undo.label).toBe('Undo Move to Trash')
  })

  it('undo:field sends a field’s own undo to the window', async () => {
    await call(IPC_CHANNELS.UNDO_FIELD, { direction: 'redo' })
    expect(editField).toHaveBeenCalledWith('redo')
  })

  it('undo:record-discard keeps the values and gives the toast its entry', async () => {
    const values = { title: 'Tote bag', description: '', tagIds: [] }
    const { undoEntryId } = await call<{ undoEntryId: number }>(IPC_CHANNELS.UNDO_RECORD_DISCARD, {
      mockupId: 5,
      values
    })
    expect(await call(IPC_CHANNELS.UNDO_ENTRY, { id: undoEntryId })).toEqual({
      status: 'done',
      label: 'Discard changes',
      renderer: { kind: 'reopen-editor', mockupId: 5, values }
    })
  })
})
