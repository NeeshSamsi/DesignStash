import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, IPC_CONTRACT, PUSH_CONTRACT, isPushChannel } from '../ipc'
import { MenuCommandSchema } from './menu'

describe('undo wire shapes', () => {
  const result = IPC_CONTRACT[IPC_CHANNELS.UNDO_RUN].response

  it('answers an undo with what it did, or why it could not', () => {
    for (const ok of [
      { status: 'done', label: 'Move to Trash' },
      { status: 'empty' },
      { status: 'dropped', label: 'Edit details', reason: 'that mockup was deleted for good' },
      { status: 'blocked', label: 'Edit details', blockedBy: 12 },
      { status: 'gone' }
    ]) {
      expect(result.safeParse(ok).success, JSON.stringify(ok)).toBe(true)
    }
    expect(result.safeParse({ status: 'blocked', label: 'Star' }).success).toBe(false)
  })

  it('takes one entry by id for a toast’s Undo', () => {
    const request = IPC_CONTRACT[IPC_CHANNELS.UNDO_ENTRY].request
    expect(request.safeParse({ id: 3 }).success).toBe(true)
    expect(request.safeParse({ id: 'three' }).success).toBe(false)
  })

  it('pushes the next labels and which toasts may still undo on their own', () => {
    const { payload } = PUSH_CONTRACT[IPC_CHANNELS.UNDO_STATE]
    expect(isPushChannel(IPC_CHANNELS.UNDO_STATE)).toBe(true)
    expect(payload.safeParse({ entries: [] }).success).toBe(true)
    expect(
      payload.safeParse({
        undoLabel: 'Move to Trash',
        redoLabel: 'Disband pile',
        entries: [{ id: 1, blockedBy: 4 }, { id: 4 }]
      }).success
    ).toBe(true)
  })

  it('hears where ⌘Z lands, and a field’s own undo or redo', () => {
    const context = IPC_CONTRACT[IPC_CHANNELS.UNDO_CONTEXT].request
    expect(['app', 'field', 'flow'].every((c) => context.safeParse({ context: c }).success)).toBe(
      true
    )
    expect(context.safeParse({ context: 'dialog' }).success).toBe(false)
    expect(
      IPC_CONTRACT[IPC_CHANNELS.UNDO_FIELD].request.safeParse({ direction: 'redo' }).success
    ).toBe(true)
  })

  it('gives an undoable response the entry it recorded, and keeps the rest of the reply', () => {
    const trash = IPC_CONTRACT[IPC_CHANNELS.MOCKUP_TRASH].response
    expect(trash.parse({ ok: true, count: 2, undoEntryId: 7 })).toEqual({
      ok: true,
      count: 2,
      undoEntryId: 7
    })
    // Not recorded (nothing changed, or not wired yet): still a valid reply.
    expect(trash.parse({ ok: true, count: 0 })).toEqual({ ok: true, count: 0 })
    // A union reply keeps its own branch.
    const stash = IPC_CONTRACT[IPC_CHANNELS.STASH_CHANGE].response
    expect(stash.parse({ ok: true, restartRequired: true, undoEntryId: 3 })).toEqual({
      ok: true,
      restartRequired: true,
      undoEntryId: 3
    })
  })

  it('tells an import’s entry with the haul’s figures', () => {
    const { payload } = PUSH_CONTRACT[IPC_CHANNELS.COPY_PROGRESS]
    const haul = {
      haulId: 'h1',
      total: 12,
      landed: 12,
      bytesTotal: 1,
      bytesCopied: 1,
      bytesPerSecond: 0,
      secondsLeft: null,
      skipped: { notPsd: 0, duplicate: 0, unreadable: 0, archiveUnsupported: 0, noPsdInArchive: 0 },
      state: 'done',
      file: null,
      undoEntryId: 9
    }
    expect(payload.parse(haul)).toMatchObject({ undoEntryId: 9 })
  })

  it('records Discard your changes with the values, and hands undo and redo back to the window', () => {
    const values = { title: 'Tote bag', description: 'Canvas', tagIds: [3], variation: 'A' }
    expect(
      IPC_CONTRACT[IPC_CHANNELS.UNDO_RECORD_DISCARD].request.safeParse({ mockupId: 4, values })
        .success
    ).toBe(true)
    const result = IPC_CONTRACT[IPC_CHANNELS.UNDO_RUN].response
    for (const renderer of [
      { kind: 'reopen-editor', mockupId: 4, values },
      { kind: 'discard-editor', mockupId: 4 }
    ]) {
      expect(result.parse({ status: 'done', label: 'Discard changes', renderer })).toMatchObject({
        renderer
      })
    }
  })

  it('carries Edit › Undo and Redo as menu commands', () => {
    expect(MenuCommandSchema.safeParse('undo').success).toBe(true)
    expect(MenuCommandSchema.safeParse('redo').success).toBe(true)
  })
})
