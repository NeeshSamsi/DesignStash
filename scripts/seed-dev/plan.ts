import { join } from 'node:path'
import type { GroupingConfirmRequest, GroupingProposal } from '@shared/grouping'
import type { LookOverUnit } from '@shared/approval'
import type { AiStatusEvent } from '@shared/ipc/ai-status'
import { HARD_STOP_FACTOR } from '../../src/main/ai/run-timing'

/**
 * The parts of the dev seed (seed.ts) that decide things, kept apart so they can be tested without
 * the app. Everything that touches the app or the disk is in seed.ts.
 */

/** The test set's real downloads, in the order they are dropped. `edge/` and `invalid/` are generated. */
export const SEED_CATEGORIES = ['zips', 'psds', 'folders', 'held-out', 'sign-off'] as const

/** Generated cases that sit inside a real category: "Mixed Drop" is solid-colour PSDs (MANIFEST.md). */
const GENERATED = new Set(['folders/Mixed Drop'])

export interface SeedDrop {
  /** `own`: a download dropped as a haul of its own (`withOwnDrops`). */
  category: (typeof SEED_CATEGORIES)[number] | 'own'
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

/**
 * Downloads that come in as hauls of their own before the categories, each alone (a person's own
 * mockups, kept through a seed from nothing), and out of the category hauls they sit in. A category
 * left with nothing is dropped.
 */
export function withOwnDrops(drops: SeedDrop[], own: string[]): SeedDrop[] {
  const mine = new Set(own)
  const rest = drops
    .map((d) => ({ ...d, paths: d.paths.filter((p) => !mine.has(p)) }))
    .filter((d) => d.paths.length > 0)
  return [...own.map((path): SeedDrop => ({ category: 'own', paths: [path] })), ...rest]
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

/**
 * `tmp/dev-backup-<date>`, or `tmp/dev-backup-<date>-<label>`, with a number after it when that one
 * exists: a backup is never overwritten.
 */
export function freshBackupDir(base: string, now: Date, exists: (path: string) => boolean, label?: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `dev-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}${label ? `-${label}` : ''}`
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

/** A library as a backup check sees it: its mockups, its mockup folders and SQLite's quick_check. */
export interface LibraryShape {
  mockups: number
  folders: string[]
  quickCheck: string
}

/** What keeps a backup from standing in for the library; empty when it can. `backup` is null when its database won't open. */
export function backupProblems(live: LibraryShape, backup: LibraryShape | null): string[] {
  if (!backup) return ['its database does not open']
  const problems: string[] = []
  if (backup.quickCheck !== 'ok') problems.push(`the database check says: ${backup.quickCheck}`)
  if (backup.mockups !== live.mockups) problems.push(`it has ${backup.mockups} mockups and the library ${live.mockups}`)
  const missing = leftoverFolders(backup.folders, live.folders)
  if (missing.length > 0) problems.push(`mockup folders missing: ${missing.join(', ')}`)
  return problems
}

/** A push the seed recorded in the window: when it came (ms) and what it said. */
export interface RecordedEvent {
  at: number
  channel: string
  payload: unknown
}

/** One mockup's suggestion run, as the ai:status pushes told it. */
export interface AiRun {
  mockupId: number
  /** When the model began on it (`run.writingSince`), or when it was first seen writing. */
  startedAt: number
  endedAt: number
  ms: number
  status: string
  /** This Mac's "taking a while" threshold for the model, when the run said it. */
  slowAfterMs: number | null
  /** It ran past the threshold, so Look it over showed "taking a while" (L6.4). */
  slow: boolean
  /** It failed at 3 times the threshold: the hard stop (L6.E3). Any other failure is "couldn't write". */
  hardStop: boolean
}

const ENDS = new Set(['ready', 'failed', 'off', 'opted_out'])
/** The hard stop's timer and the push's arrival aren't one clock: a failure within 5% of the stop counts. */
const HARD_STOP_SLACK = 0.95

/** Every finished run in the recorded pushes, in the order they ended. */
export function aiRuns(events: RecordedEvent[]): AiRun[] {
  const open = new Map<number, { startedAt: number | null; seenAt: number; slowAfterMs: number | null }>()
  const runs: AiRun[] = []
  for (const { at, channel, payload } of events) {
    if (channel !== 'ai:status') continue
    for (const u of (payload as AiStatusEvent).updates) {
      if (u.status === 'sniffing') {
        const now = open.get(u.mockupId) ?? { startedAt: null, seenAt: at, slowAfterMs: null }
        open.set(u.mockupId, {
          startedAt: now.startedAt ?? u.run?.writingSince ?? null,
          seenAt: now.seenAt,
          slowAfterMs: u.run?.slowAfterMs ?? now.slowAfterMs
        })
        continue
      }
      const started = open.get(u.mockupId)
      if (!ENDS.has(u.status) || !started) continue
      open.delete(u.mockupId)
      const startedAt = started.startedAt ?? started.seenAt
      const ms = at - startedAt
      const limit = started.slowAfterMs
      runs.push({
        mockupId: u.mockupId,
        startedAt,
        endedAt: at,
        ms,
        status: u.status,
        slowAfterMs: limit,
        slow: limit !== null && ms > limit,
        hardStop: limit !== null && u.status === 'failed' && ms >= HARD_STOP_FACTOR * limit * HARD_STOP_SLACK
      })
    }
  }
  return runs
}

/**
 * About how long each pile's variation request took. The queue asks a pile as soon as its last
 * suggestion lands, ahead of the next mockup, so the request is the gap from that landing to the
 * next run's start (or to `idleAt`, when the model went quiet, for the last one). Null when one of
 * its mockups never ran, or nothing came after it.
 */
export function pileRequests(runs: AiRun[], piles: ReadonlyMap<number, number[]>, idleAt: number | null): { pileId: number; ms: number | null }[] {
  const last = new Map<number, AiRun>()
  for (const r of runs) last.set(r.mockupId, r)
  return [...piles].map(([pileId, ids]) => {
    const mine = ids.map((id) => last.get(id))
    if (mine.some((r) => !r)) return { pileId, ms: null }
    const landed = Math.max(...mine.map((r) => r!.endedAt))
    const next = runs.filter((r) => r.startedAt >= landed && !ids.includes(r.mockupId)).map((r) => r.startedAt)
    const until = next.length > 0 ? Math.min(...next) : idleAt
    return { pileId, ms: until === null ? null : until - landed }
  })
}

/** Words that more than one mockup has, compared as `numberRepeats` does: case and spacing aside. */
export function repeatedWords(words: (string | null)[]): string[] {
  const seen = new Map<string, number>()
  for (const w of words) {
    if (!w) continue
    const key = w.trim().replace(/\s+/g, ' ').toLowerCase()
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen].filter(([, n]) => n > 1).map(([key]) => key)
}
