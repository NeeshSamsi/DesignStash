import { describe, expect, it } from 'vitest'
import type { GroupMember, GroupingProposal } from '@shared/grouping'
import {
  confirmFromProposal,
  diskIsTight,
  freshBackupDir,
  leftoverFolders,
  seedDrops,
  stashCall
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
