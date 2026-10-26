import { describe, expect, it } from 'vitest'
import type { GroupMember, GroupingProposal } from '@shared/grouping'
import {
  aiRuns,
  backupProblems,
  confirmFromProposal,
  diskIsTight,
  freshBackupDir,
  leftoverFolders,
  pileRequests,
  repeatedWords,
  seedDrops,
  withOwnDrops,
  stashCall,
  type RecordedEvent
} from './plan'

const listing: Record<string, string[]> = {
  '/set': [
    '.DS_Store',
    'MANIFEST.md',
    'edge',
    'folders',
    'held-out',
    'invalid',
    'psds',
    'sign-off',
    'zips'
  ],
  '/set/zips': ['b.zip', '.DS_Store', 'a.zip'],
  '/set/psds': ['.DS_Store', 'Rocks.psd'],
  '/set/folders': ['.DS_Store', 'Long Website Mockup', 'Mixed Drop'],
  '/set/held-out': ['mug.zip'],
  '/set/sign-off': ['apron.zip', 'lighter.zip']
}
const readdir = (dir: string): string[] => listing[dir] ?? []

describe('seedDrops', () => {
  it('drops every real download, one haul per category, and leaves the generated cases out', () => {
    expect(seedDrops('/set', readdir)).toEqual([
      { category: 'zips', paths: ['/set/zips/a.zip', '/set/zips/b.zip'] },
      { category: 'psds', paths: ['/set/psds/Rocks.psd'] },
      { category: 'folders', paths: ['/set/folders/Long Website Mockup'] },
      { category: 'held-out', paths: ['/set/held-out/mug.zip'] },
      { category: 'sign-off', paths: ['/set/sign-off/apron.zip', '/set/sign-off/lighter.zip'] }
    ])
  })

  it('skips a category that is empty or missing', () => {
    expect(
      seedDrops('/set', (dir) => (dir === '/set/psds' ? [] : readdir(dir))).map((d) => d.category)
    ).toEqual(['zips', 'folders', 'held-out', 'sign-off'])
  })
})

describe('withOwnDrops: downloads that arrive as their own haul, first', () => {
  it('drops each one alone before the categories, and keeps it out of its category\'s haul', () => {
    const drops = withOwnDrops(seedDrops('/set', readdir), ['/set/folders/Long Website Mockup'])
    expect(drops.slice(0, 2)).toEqual([
      { category: 'own', paths: ['/set/folders/Long Website Mockup'] },
      { category: 'zips', paths: ['/set/zips/a.zip', '/set/zips/b.zip'] }
    ])
    expect(drops.map((d) => d.category)).not.toContain('folders')
  })

  it('changes nothing without any', () => {
    expect(withOwnDrops(seedDrops('/set', readdir), [])).toEqual(seedDrops('/set', readdir))
  })
})

const member = (mockupId: number, isPrimary = false): GroupMember => ({
  mockupId,
  fileName: `${mockupId}.psd`,
  folderTrail: [],
  coverPath: '',
  isPrimary
})

describe('confirmFromProposal', () => {
  it('confirms the piles as proposed, top first, like the Sort board does', () => {
    const proposal: GroupingProposal = {
      batchId: 'b1',
      groups: [
        { id: 'g1', members: [member(4), member(5, true), member(6)], reason: 'archive' },
        { id: 'g2', members: [member(7, true), member(8)], reason: 'stem' }
      ],
      singletons: [member(9), member(10)]
    }
    expect(confirmFromProposal(proposal)).toEqual({
      batchId: 'b1',
      groups: [
        { id: 'g1', memberIds: [5, 4, 6] },
        { id: 'g2', memberIds: [7, 8] }
      ],
      singletonIds: [9, 10]
    })
  })
})

describe('stashCall', () => {
  it('stashes a pile whole and a single on its own', () => {
    expect(stashCall({ unitId: 3, kind: 'pile' })).toEqual({
      channel: 'pile:stash',
      args: { pileId: 3 }
    })
    expect(stashCall({ unitId: 9, kind: 'single' })).toEqual({
      channel: 'mockup:stash',
      args: { mockupId: 9 }
    })
  })
})

describe('freshBackupDir', () => {
  it('names the backup by date, and never reuses one that exists', () => {
    const taken = new Set(['/repo/tmp/dev-backup-2026-10-24', '/repo/tmp/dev-backup-2026-10-24-2'])
    expect(freshBackupDir('/repo/tmp', new Date('2026-10-25T09:00:00'), (p) => taken.has(p))).toBe(
      '/repo/tmp/dev-backup-2026-10-25'
    )
    expect(freshBackupDir('/repo/tmp', new Date('2026-10-24T09:00:00'), (p) => taken.has(p))).toBe(
      '/repo/tmp/dev-backup-2026-10-24-3'
    )
  })

  it('takes a label after the date', () => {
    expect(freshBackupDir('/repo/tmp', new Date('2026-10-26T09:00:00'), () => false, 'pile-titles')).toBe(
      '/repo/tmp/dev-backup-2026-10-26-pile-titles'
    )
  })
})

describe('backupProblems: a backup must hold the library as it is', () => {
  const live = { mockups: 90, folders: ['a', 'b'], quickCheck: 'ok' }

  it('finds none when the backup has every mockup and folder, and its database is sound', () => {
    expect(backupProblems(live, { mockups: 90, folders: ['b', 'a'], quickCheck: 'ok' })).toEqual([])
  })

  it('says what is missing or broken', () => {
    expect(backupProblems(live, { mockups: 89, folders: ['a'], quickCheck: 'database disk image is malformed' })).toEqual([
      'the database check says: database disk image is malformed',
      'it has 89 mockups and the library 90',
      'mockup folders missing: b'
    ])
    expect(backupProblems(live, null)).toEqual(['its database does not open'])
  })
})

/** An `ai:status` push as the seed records it. */
const status = (at: number, mockupId: number, s: string, run?: { phase: string; writingSince: number | null; slowAfterMs: number }): RecordedEvent => ({
  at,
  channel: 'ai:status',
  payload: { updates: [{ mockupId, status: s, ...(run && { run }) }], totals: { total: 0, remaining: 0 } }
})
const writing = (since: number) => ({ phase: 'writing', writingSince: since, slowAfterMs: 40_000 })

describe('aiRuns: each mockup\'s run, from the ai:status pushes', () => {
  it('times a run from when it began writing to when it landed', () => {
    const runs = aiRuns([
      status(1_000, 7, 'pending', { phase: 'queued', writingSince: null, slowAfterMs: 40_000 }),
      status(2_000, 7, 'sniffing', { phase: 'starting', writingSince: null, slowAfterMs: 40_000 }),
      status(3_000, 7, 'sniffing', writing(2_500)),
      status(12_500, 7, 'ready')
    ])
    expect(runs).toEqual([
      { mockupId: 7, startedAt: 2_500, endedAt: 12_500, ms: 10_000, status: 'ready', slowAfterMs: 40_000, slow: false, hardStop: false }
    ])
  })

  it('marks a run past the slow threshold as taking a while, and a failure at 3 times it as a hard stop', () => {
    const runs = aiRuns([
      status(0, 1, 'sniffing', writing(0)),
      status(50_000, 1, 'ready'),
      status(50_000, 2, 'sniffing', writing(50_000)),
      status(170_100, 2, 'failed'),
      status(170_100, 3, 'sniffing', writing(170_100)),
      status(180_000, 3, 'failed')
    ])
    expect(runs.map((r) => [r.mockupId, r.slow, r.hardStop, r.status])).toEqual([
      [1, true, false, 'ready'],
      [2, true, true, 'failed'],
      [3, false, false, 'failed']
    ])
  })

  it('reads every update in a push, and ignores other channels', () => {
    const both: RecordedEvent = {
      at: 9_000,
      channel: 'ai:status',
      payload: { updates: [{ mockupId: 1, status: 'ready' }, { mockupId: 2, status: 'sniffing', run: writing(9_000) }], totals: { total: 0, remaining: 0 } }
    }
    const runs = aiRuns([status(0, 1, 'sniffing', writing(0)), { at: 1, channel: 'look-over:draft', payload: {} }, both, status(20_000, 2, 'ready')])
    expect(runs.map((r) => [r.mockupId, r.ms])).toEqual([
      [1, 9_000],
      [2, 11_000]
    ])
  })
})

describe('pileRequests: about how long each pile\'s variation request took', () => {
  const run = (mockupId: number, startedAt: number, endedAt: number) => ({
    mockupId,
    startedAt,
    endedAt,
    ms: endedAt - startedAt,
    status: 'ready' as const,
    slowAfterMs: 40_000,
    slow: false,
    hardStop: false
  })

  it('is the gap between the pile\'s last suggestion and the next run, which waits for it', () => {
    const runs = [run(1, 0, 10_000), run(2, 10_000, 20_000), run(3, 24_500, 30_000), run(4, 30_000, 40_000)]
    const piles = new Map([
      [1, [1, 2]],
      [4, [4]]
    ])
    expect(pileRequests(runs, piles, 46_000)).toEqual([
      { pileId: 1, ms: 4_500 },
      { pileId: 4, ms: 6_000 }
    ])
  })

  it('has no time for a pile with a mockup that never ran, or when nothing came after it', () => {
    const runs = [run(1, 0, 10_000)]
    expect(pileRequests(runs, new Map([[1, [1, 2]]]), 20_000)).toEqual([{ pileId: 1, ms: null }])
    expect(pileRequests(runs, new Map([[1, [1]]]), null)).toEqual([{ pileId: 1, ms: null }])
  })
})

describe('repeatedWords', () => {
  it('names words two mockups share, whatever their case or spacing', () => {
    expect(repeatedWords(['side', 'front', 'Side', 'top  view', 'top view', null])).toEqual(['side', 'top view'])
    expect(repeatedWords(['side', 'side 2'])).toEqual([])
  })
})

describe('leftoverFolders', () => {
  it('names the mockup folders that came after the backup', () => {
    expect(leftoverFolders(['a', 'b'], ['b', 'c', 'a', 'd'])).toEqual(['c', 'd'])
    expect(leftoverFolders(['a'], ['a'])).toEqual([])
  })
})

describe('diskIsTight', () => {
  const GB = 1024 ** 3
  it('is tight when the copy would leave less than 10 GB free', () => {
    expect(diskIsTight(125 * GB, 7.5 * GB)).toBe(false)
    expect(diskIsTight(17 * GB, 7.5 * GB)).toBe(true)
  })
})
