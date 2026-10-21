import { describe, expect, it } from 'vitest'
import type { CopyFile, CopyStatus } from '@shared/ipc/import'
import {
  dragVerdict,
  dropTarget,
  filePercent,
  keepDropped,
  overallPercent,
  overlayFor,
  processed,
  remainingText,
  rowDetail,
  rowState,
  undoneMessage,
  widgetCopy,
  widgetState
} from './gather-model'

// The overrides may pick any state, so the merged object is checked against the union by the cast.
const haul = (over: Partial<CopyStatus> = {}): CopyStatus =>
  ({
    haulId: 'h1',
    state: 'running',
    total: 40,
    landed: 12,
    bytesTotal: 0,
    bytesCopied: 0,
    bytesPerSecond: 0,
    secondsLeft: null,
    skipped: { notPsd: 0, duplicate: 0, unreadable: 0, archiveUnsupported: 0, noPsdInArchive: 0 },
    files: [],
    ...over
  }) as CopyStatus

describe('smooth progress', () => {
  it('counts the bar in bytes, so a big file moves it while it copies', () => {
    const mid = haul({ total: 2, landed: 0, bytesTotal: 1000, bytesCopied: 410 })
    expect(overallPercent(mid)).toBe(41)
    expect(widgetCopy(mid).percent).toBe(41)
    expect(overallPercent(haul({ bytesTotal: 1000, bytesCopied: 1000 }))).toBe(100)
    expect(overallPercent(haul({ bytesTotal: 1000, bytesCopied: 5000 }))).toBe(100)
  })

  it('never reads 100 before it is done, and falls back to counting files without sizes', () => {
    expect(overallPercent(haul({ bytesTotal: 1000, bytesCopied: 999 }))).toBe(99)
    expect(overallPercent(haul({ total: 40, landed: 10, bytesTotal: 0 }))).toBe(25)
    expect(overallPercent(haul({ total: 0, landed: 0, bytesTotal: 0 }))).toBe(0)
  })

  it('gives each file its own percent from its bytes', () => {
    const file = (over: Partial<CopyFile>): CopyFile => ({
      jobId: 1,
      name: 'a.psd',
      status: 'copying',
      ...over
    })
    expect(filePercent(file({ size: 200, bytesCopied: 50 }))).toBe(25)
    expect(filePercent(file({ size: 200, bytesCopied: 0 }))).toBe(0)
    expect(filePercent(file({ status: 'queued' }))).toBe(0)
    expect(filePercent(file({ status: 'done', size: 200, bytesCopied: 200 }))).toBe(100)
    expect(filePercent(file({ size: 0, bytesCopied: 0 }))).toBe(0)
  })

  it('says how long is left in steps that settle, and nothing until it is measured', () => {
    const left = (secondsLeft: number | null, state: CopyStatus['state'] = 'running') =>
      remainingText(haul({ secondsLeft, state }))
    expect(left(null)).toBe('')
    expect(left(3)).toBe('A few seconds left')
    expect(left(12)).toBe('About 15 seconds left')
    expect(left(55)).toBe('About 55 seconds left')
    expect(left(56)).toBe('About 1 min left')
    expect(left(61)).toBe('About 2 min left')
    expect(left(600)).toBe('About 10 min left')
    expect(left(3540)).toBe('About 59 min left')
    expect(left(3600)).toBe('About 1 hr left')
    expect(left(3 * 3600)).toBe('About 3 hr left')
    expect(left(3600 + 20 * 60 + 1)).toBe('About 1 hr 21 min left')
    expect(left(30, 'paused')).toBe('')
  })
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
      processed(
        haul({
          landed: 10,
          skipped: {
            notPsd: 5,
            duplicate: 1,
            unreadable: 1,
            archiveUnsupported: 0,
            noPsdInArchive: 0
          }
        })
      )
    ).toBe(12)
  })

  it('counts an archive left whole as looked at, and as skipped in the title', () => {
    const skipped = {
      notPsd: 0,
      duplicate: 0,
      unreadable: 0,
      archiveUnsupported: 1,
      noPsdInArchive: 2
    }
    expect(processed(haul({ landed: 10, skipped }))).toBe(13)
    expect(widgetCopy(haul({ state: 'done', total: 13, landed: 10, skipped })).title).toBe(
      '10 copied · 3 skipped'
    )
  })

  it('says how far along a copy is', () => {
    expect(widgetCopy(haul())).toEqual({ title: '12 of 40 copied', percent: 30 })
  })

  it('puts thousands separators in the counts', () => {
    expect(widgetCopy(haul({ total: 1204, landed: 1204 })).title).toBe('1,204 of 1,204 copied')
    expect(
      widgetCopy(
        haul({
          state: 'done',
          landed: 1200,
          skipped: {
            notPsd: 1000,
            duplicate: 4,
            unreadable: 0,
            archiveUnsupported: 0,
            noPsdInArchive: 0
          }
        })
      ).title
    ).toBe('1,200 copied · 1,004 skipped')
  })

  it('says how big a copied file is, and that a file never reached after a stop was not copied', () => {
    const file = (over: Partial<CopyFile>): CopyFile => ({
      jobId: 1,
      name: 'a.psd',
      status: 'done',
      ...over
    })
    expect(rowDetail(file({ size: 312_000_000 }), haul())).toBe('Copied · 312 MB')
    expect(rowDetail(file({}), haul())).toBe('Copied')
    expect(rowDetail(file({ status: 'queued' }), haul())).toBeNull()
    expect(rowDetail(file({ status: 'queued' }), haul({ state: 'cancelled' }))).toBe('Not copied')
  })

  it('summarises a finished haul with what was skipped', () => {
    const done = haul({
      state: 'done',
      landed: 38,
      skipped: { notPsd: 2, duplicate: 1, unreadable: 0, archiveUnsupported: 0, noPsdInArchive: 0 }
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

describe('files out of a zip', () => {
  const zipped = { archiveName: 'Free_Cap_Mockup.zip' }
  const file = (over: Partial<CopyFile>): CopyFile => ({
    jobId: 1,
    name: 'a.psd',
    status: 'done',
    ...over
  })
  it('says which zip a PSD comes from, and that it is unpacking', () => {
    expect(rowDetail(file({ ...zipped, status: 'queued' }), haul())).toBe(
      'From Free_Cap_Mockup.zip'
    )
    expect(rowDetail(file({ ...zipped, status: 'copying' }), haul())).toBe(
      'Unpacking… · From Free_Cap_Mockup.zip'
    )
    expect(rowDetail(file({ ...zipped, status: 'done', size: 312_000_000 }), haul())).toBe(
      'Copied · 312 MB · From Free_Cap_Mockup.zip'
    )
  })

  it('words the two archive skips and keeps them out of the not-PSD sentence', () => {
    const rar = file({ status: 'skipped', skipReason: 'archive-unsupported' })
    const empty = file({ status: 'skipped', skipReason: 'no-psd-in-archive' })
    expect(rowDetail(rar, haul())).toBe('Unzip this one first')
    expect(rowDetail(empty, haul())).toBe('No PSD inside')
    expect(rowState(rar)).toBe('not-psd')
    expect(rowDetail(file({ status: 'skipped', skipReason: 'not-psd' }), haul())).toBeNull()
  })

  it('lets zips and other archives through a drag and a drop', () => {
    expect(dragVerdict([{ kind: 'file', type: 'application/zip' }])).toBe('ok')
    expect(dragVerdict([{ kind: 'file', type: 'application/x-zip-compressed' }])).toBe('ok')
    expect(dragVerdict([{ kind: 'file', type: 'application/x-7z-compressed' }])).toBe('ok')
    const files = [
      { name: 'Cap.ZIP', type: 'application/zip' },
      { name: 'old.rar', type: '' },
      { name: 'b.7z', type: '' },
      { name: 'b.png', type: 'image/png' }
    ]
    expect(keepDropped(files)).toEqual([0, 1, 2])
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
      title: 'Those aren’t PSDs or zips'
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
