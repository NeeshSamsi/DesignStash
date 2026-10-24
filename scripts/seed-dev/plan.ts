import { join } from 'node:path'
import type { GroupingConfirmRequest, GroupingProposal } from '@shared/grouping'
import type { LookOverUnit } from '@shared/approval'

/**
 * The parts of the dev seed (seed.ts) that decide things, kept apart so they can be tested without
 * the app. Everything that touches the app or the disk is in seed.ts.
 */

/** The test set's real downloads, in the order they are dropped. `edge/` and `invalid/` are generated. */
export const SEED_CATEGORIES = ['zips', 'psds', 'folders', 'held-out', 'sign-off'] as const

/** Generated cases that sit inside a real category: "Mixed Drop" is solid-colour PSDs (MANIFEST.md). */
const GENERATED = new Set(['folders/Mixed Drop'])

export interface SeedDrop {
  category: (typeof SEED_CATEGORIES)[number]
  /** Each download as dropped: a zip, a PSD or a folder, by its full path. */
  paths: string[]
}

/** One haul per category, holding every download in it, so the tuning sets stay apart in Sort. */
export function seedDrops(root: string, readdir: (dir: string) => string[]): SeedDrop[] {
  return SEED_CATEGORIES.flatMap((category) => {
    const paths = readdir(join(root, category))
      .filter((name) => !name.startsWith('.') && !GENERATED.has(`${category}/${name}`))
      .sort()
      .map((name) => join(root, category, name))
    return paths.length > 0 ? [{ category, paths }] : []
  })
}

/** The piles as proposed, each with its top first, the way the Sort board confirms them (boardFromProposal). */
export function confirmFromProposal(proposal: GroupingProposal): GroupingConfirmRequest {
  return {
    batchId: proposal.batchId,
    groups: proposal.groups.map((g) => ({
      id: g.id,
      memberIds: [...g.members]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((m) => m.mockupId)
    })),
    singletonIds: proposal.singletons.map((m) => m.mockupId)
  }
}

/** The channel that stashes a Look it over unit as its drafts stand. */
export function stashCall(
  unit: Pick<LookOverUnit, 'unitId' | 'kind'>
):
  | { channel: 'pile:stash'; args: { pileId: number } }
  | { channel: 'mockup:stash'; args: { mockupId: number } } {
  return unit.kind === 'pile'
    ? { channel: 'pile:stash', args: { pileId: unit.unitId } }
    : { channel: 'mockup:stash', args: { mockupId: unit.unitId } }
}

/** `tmp/dev-backup-<date>`, with a number after it when that one exists: a backup is never overwritten. */
export function freshBackupDir(base: string, now: Date, exists: (path: string) => boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `dev-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  let dir = join(base, name)
  for (let n = 2; exists(dir); n++) dir = join(base, `${name}-${n}`)
  return dir
}

/** The mockup folders a restore removes: the ones that were not there when the backup was made. */
export function leftoverFolders(atBackup: string[], now: string[]): string[] {
  const kept = new Set(atBackup)
  return now.filter((name) => !kept.has(name))
}

/** Room for the copy plus 10 GB, so the Mac and the copy queue's own reserve aren't squeezed. */
export function diskIsTight(freeBytes: number, neededBytes: number): boolean {
  return freeBytes - neededBytes < 10 * 1024 ** 3
}
