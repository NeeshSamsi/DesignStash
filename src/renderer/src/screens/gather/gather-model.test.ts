import { describe, expect, it } from 'vitest'
import type { CopyFile, CopyStatus } from '@shared/ipc/import'
import {
  dragVerdict,
  dropTarget,
  keepDropped,
  overlayFor,
  processed,
  rowState,
  undoneMessage,
  widgetCopy,
  widgetState
} from './gather-model'

const haul = (over: Partial<CopyStatus> = {}): CopyStatus => ({
  haulId: 'h1',
  state: 'running',
  pauseReason: null,
  total: 40,
  landed: 12,
  skipped: { notPsd: 0, duplicate: 0, unreadable: 0 },
  files: [],
  ...over
})

describe('widget', () => {
  it('maps the haul state to the widget state', () => {
    expect(widgetState(haul())).toBe('copying')
    expect(widgetState(haul({ state: 'paused', pauseReason: 'disk-full' }))).toBe('error')
    expect(widgetState(haul({ state: 'done' }))).toBe('done')
    expect(widgetState(haul({ state: 'cancelled' }))).toBe('stopped')
    expect(widgetState(haul({ state: 'undone' }))).toBeNull()
  })

  it('counts landed plus duplicates and unreadable files, never non-PSDs', () => {
    expect(
      processed(haul({ landed: 10, skipped: { notPsd: 5, duplicate: 1, unreadable: 1 } }))
    ).toBe(12)
  })

  it('says how far along a copy is', () => {
    expect(widgetCopy(haul())).toEqual({ title: 'Copying 12 of 40', percent: 30 })
  })

  it('summarises a finished haul with what was skipped', () => {
    const done = haul({
      state: 'done',
      landed: 38,
      skipped: { notPsd: 2, duplicate: 1, unreadable: 0 }
    })
    expect(widgetCopy(done).title).toBe('38 copied · 3 skipped')
    expect(widgetCopy(haul({ state: 'done', landed: 5 })).title).toBe('5 copied')
  })

  it('asks keep or undo once stopped', () => {
    expect(widgetCopy(haul({ state: 'cancelled' }))).toMatchObject({
      title: 'Copying stopped at 12 of 40',
      description: 'Keep the 12 that made it in, or undo all?'
    })
  })

  it('explains a pause in plain words, and says what already landed is safe', () => {
    const disk = widgetCopy(haul({ state: 'paused', pauseReason: 'disk-full' }))
    expect(disk.title).toBe('Copying paused · your disk is full')
    expect(disk.description).toContain('The 12 already copied are safe in To sort.')
    const gone = widgetCopy(haul({ state: 'paused', pauseReason: 'source-gone', landed: 1 }))
    expect(gone.title).toBe('Copying paused · a drive was unplugged')
    expect(gone.description).toContain('Plug it back in')
    expect(gone.description).toContain('1 already copied is safe')
  })

  it('shows no file paths or codes anywhere', () => {
    for (const reason of ['disk-full', 'source-gone'] as const) {
      const copy = widgetCopy(haul({ state: 'paused', pauseReason: reason }))
      expect(`${copy.title} ${copy.description}`).not.toMatch(/\/|ENOSPC|_/)
    }
  })

  it('names the row state of each file', () => {
    const file = (over: Partial<CopyFile>): CopyFile => ({
      jobId: 1,
      name: 'a.psd',
      status: 'queued',
      ...over
    })
    expect(rowState(file({}))).toBe('queued')
    expect(rowState(file({ status: 'copying' }))).toBe('copying')
    expect(rowState(file({ status: 'done' }))).toBe('done')
    expect(rowState(file({ status: 'skipped', skipReason: 'duplicate' }))).toBe('duplicate')
    expect(rowState(file({ status: 'skipped', skipReason: 'not-psd' }))).toBe('not-psd')
  })

  it('words the undo toast', () => {
    expect(undoneMessage(12).description).toBe(
      '12 mockups removed from To sort. Your originals weren’t touched.'
    )
    expect(undoneMessage(1).description).toContain('1 mockup removed')
  })
})

describe('drags', () => {
  it('rejects a drag where every file is certainly not a PSD', () => {
    expect(
      dragVerdict([
        { kind: 'file', type: 'image/png' },
        { kind: 'file', type: 'application/pdf' }
      ])
    ).toBe('rejected')
  })

  it('lets a PSD, an untyped file or a folder through', () => {
    expect(dragVerdict([{ kind: 'file', type: 'image/vnd.adobe.photoshop' }])).toBe('ok')
    expect(dragVerdict([{ kind: 'file', type: '' }])).toBe('ok')
    expect(
      dragVerdict([
        { kind: 'file', type: 'image/png' },
        { kind: 'file', type: '' }
      ])
    ).toBe('ok')
  })

  it('does not reject drags that are not files', () => {
    expect(dragVerdict([{ kind: 'string', type: 'text/plain' }])).toBe('ok')
    expect(dragVerdict([])).toBe('ok')
  })

  it('on drop keeps PSDs and folders, and drops the rest', () => {
    const files = [
      { name: 'a.PSD', type: '' },
      { name: 'b.png', type: 'image/png' },
      { name: 'Client mockups', type: '' },
      { name: 'c.psb', type: '' },
      { name: 'notes.txt', type: 'text/plain' }
    ]
    expect(keepDropped(files)).toEqual([0, 2, 3])
  })
})

describe('where a drop lands', () => {
  const free = { settingsOpen: false, modalOpen: false }
  it('My Stash and To sort are the only targets', () => {
    expect(dropTarget('all', free)).toBe('my-stash')
    expect(dropTarget('starred', free)).toBe('my-stash')
    expect(dropTarget('to-sort', free)).toBe('to-sort')
    expect(dropTarget('to-stash', free)).toBe('none')
    expect(dropTarget('trash', free)).toBe('none')
  })

  it('nothing lands under Settings or another dialog', () => {
    expect(dropTarget('all', { settingsOpen: true, modalOpen: false })).toBe('none')
    expect(dropTarget('to-sort', { settingsOpen: false, modalOpen: true })).toBe('none')
  })
})

describe('overlay copy', () => {
  const base = { target: 'my-stash', verdict: 'ok', copying: false, count: 3, waiting: 0 } as const
  it('shows nothing where a hint shows instead', () => {
    expect(overlayFor({ ...base, target: 'none' })).toBeNull()
  })

  it('My Stash uses the component’s own words', () => {
    expect(overlayFor(base)).toEqual({ state: 'drag-over' })
  })

  it('To sort says the drop joins what is waiting', () => {
    expect(overlayFor({ ...base, target: 'to-sort', waiting: 38 })).toEqual({
      state: 'drag-over',
      title: 'Drop to add them to To sort',
      description: 'They’ll join the 38 mockups already waiting.'
    })
  })

  it('rejects non-PSDs', () => {
    expect(overlayFor({ ...base, verdict: 'rejected' })).toMatchObject({
      state: 'rejected',
      title: 'Those aren’t PSDs'
    })
  })

  it('queues while a copy runs, counting what was dragged', () => {
    expect(overlayFor({ ...base, copying: true, count: 6 })).toEqual({
      state: 'queued',
      title: 'Add 6 more to the copy',
      description: 'They join the files already copying, then land in To sort.'
    })
  })

  it('a rejected drag stays rejected even while copying', () => {
    expect(overlayFor({ ...base, copying: true, verdict: 'rejected' })?.state).toBe('rejected')
  })
})
