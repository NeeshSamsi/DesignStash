/**
 * seed-dev: puts the DesignStash test set's real downloads in the dev app's stash, through the app's
 * own pipeline. The built app is launched on the dev userData and driven over its IPC channels, the
 * way e2e/fixtures/seed.ts drives it in a spec. Close the dev app and run `pnpm build` first.
 *
 *   pnpm seed:dev import            back up, then copy in, covers, masks and Sort's piles. No model runs.
 *   pnpm seed:dev suggest           AI suggestions from the dev app's model, then stash every pile and
 *                                   single with them, unedited, and wait for meaning search's vectors.
 *   pnpm seed:dev restore <backup>  put the library back as the backup has it.
 *
 * `import` drops one haul per category (zips, psds, folders, held-out, sign-off) and leaves out
 * `edge/`, `invalid/` and folders/Mixed Drop, which are generated. Run again, it adds only what is
 * missing: the copy queue skips a PSD whose content is already in the stash. During `import` the
 * Swift helper is pointed at /usr/bin/false, so Apple's model reads as unavailable and every new
 * mockup lands with its AI marked off. `suggest` sets those back to pending, and the app's queue
 * picks them up at launch, as it does for fix-placeholder-covers.ts. The hauls it made are kept in
 * tmp/dev-seed/hauls.json, so `suggest` touches nothing else in the inbox.
 *
 * DESIGNSTASH_USER_DATA and DESIGNSTASH_TEST_SET override the dev userData and the test set.
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { LookOverQueue, StashResult } from '@shared/approval'
import type { GroupingProposal } from '@shared/grouping'
import type { CopyStatus } from '@shared/ipc/import'
import {
  confirmFromProposal,
  diskIsTight,
  freshBackupDir,
  leftoverFolders,
  seedDrops,
  stashCall
} from './plan'

const REPO = process.cwd()
const USER_DATA =
  process.env.DESIGNSTASH_USER_DATA ??
  join(homedir(), 'Library', 'Application Support', 'designstash')
const TEST_SET =
  process.env.DESIGNSTASH_TEST_SET ?? join(homedir(), 'Downloads', 'DesignStash Test Set')
const HAULS_FILE = join(REPO, 'tmp', 'dev-seed', 'hauls.json')
const DB_FILES = ['designstash.db', 'designstash.db-wal', 'designstash.db-shm']
const GB = 1024 ** 3

interface Settings {
  libraryRoot?: string
  activeModelId?: string | null
}

function settings(): Settings {
  return JSON.parse(readFileSync(join(USER_DATA, 'settings.json'), 'utf8')) as Settings
}

function libraryRoot(): string {
  return settings().libraryRoot ?? join(USER_DATA, 'Library')
}

const dbPath = () => join(libraryRoot(), 'designstash.db')
const log = (line: string) => console.log(`[seed] ${line}`)
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Stops here when anything has the library's database open: the dev app must be closed. */
function assertAppClosed(): void {
  let pids = ''
  try {
    pids = execFileSync('lsof', ['-t', dbPath()], { encoding: 'utf8' }).trim()
  } catch {
    // lsof exits 1 when nothing has the file open.
  }
  if (pids) throw new Error(`Close DesignStash first: the library is open in process ${pids}.`)
}

function sizeOf(path: string): number {
  const st = statSync(path)
  if (!st.isDirectory()) return st.size
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0)
}

const recordedHauls = (): string[] =>
  existsSync(HAULS_FILE) ? (JSON.parse(readFileSync(HAULS_FILE, 'utf8')) as string[]) : []

function recordHaul(id: string): void {
  mkdirSync(join(HAULS_FILE, '..'), { recursive: true })
  writeFileSync(HAULS_FILE, JSON.stringify([...new Set([...recordedHauls(), id])], null, 2))
}

// ── The app ──────────────────────────────────────────────────────────────────────────────────

interface Launched {
  app: ElectronApplication
  window: Page
  ok: <T>(channel: string, args?: unknown) => Promise<T>
}

/** The built app on the dev userData, as `pnpm start` runs it, never in test mode or with the stub AI. */
async function launch(env: Record<string, string> = {}): Promise<Launched> {
  const base = { ...process.env }
  for (const key of ['NODE_ENV', 'DESIGNSTASH_E2E_STUB_AI', 'ELECTRON_RENDERER_URL'])
    delete base[key]
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${USER_DATA}`],
    cwd: REPO,
    env: { ...base, ...env } as Record<string, string>
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForFunction(() => 'api' in window)
  const ok = async <T>(channel: string, args?: unknown): Promise<T> => {
    const res = await window.evaluate(
      ([c, a]) =>
        (
          window as unknown as {
            api: {
              invoke: (c: string, a: unknown) => Promise<{ success: boolean; data?: unknown }>
            }
          }
        ).api.invoke(c as string, a),
      [channel, args] as const
    )
    if (!res.success) throw new Error(`${channel} was refused: ${JSON.stringify(res)}`)
    return res.data as T
  }
  // The library must have opened, or none of its channels are there.
  await ok('inbox:get-counts')
  // Marker for whoever holds the better-sqlite3 lock: the native module is loaded now.
  log('App is up.')
  return { app, window, ok }
}

// ── import ───────────────────────────────────────────────────────────────────────────────────

function backUp(): string {
  const dir = freshBackupDir(join(REPO, 'tmp'), new Date(), existsSync)
  const root = libraryRoot()
  mkdirSync(dir, { recursive: true })
  copyFileSync(join(USER_DATA, 'settings.json'), join(dir, 'settings.json'))
  for (const name of DB_FILES) {
    if (existsSync(join(root, name))) copyFileSync(join(root, name), join(dir, name))
  }
  const mockupsDir = join(root, 'mockups')
  const folders = existsSync(mockupsDir) ? readdirSync(mockupsDir) : []
  writeFileSync(join(dir, 'mockups.txt'), folders.join('\n'))
  writeFileSync(
    join(dir, 'backup.json'),
    JSON.stringify({ userData: USER_DATA, libraryRoot: root }, null, 2)
  )
  return dir
}

async function runImport(): Promise<void> {
  if (!existsSync(join(TEST_SET, 'MANIFEST.md'))) throw new Error(`No test set at ${TEST_SET}.`)
  assertAppClosed()
  const drops = seedDrops(TEST_SET, (dir) => (existsSync(dir) ? readdirSync(dir) : []))

  const needed = drops.flatMap((d) => d.paths).reduce((sum, p) => sum + sizeOf(p), 0)
  const st = statfsSync(libraryRoot())
  const free = st.bavail * st.bsize
  log(`Disk: ${(free / GB).toFixed(1)} GB free, the drops are ${(needed / GB).toFixed(1)} GB.`)
  if (diskIsTight(free, needed)) throw new Error('Not enough free disk space for the seed.')

  log(`Backed up the library to ${backUp()}`)

  const { app, ok } = await launch({ DESIGNSTASH_HELPER: '/usr/bin/false' })
  try {
    for (const drop of drops) {
      log(`Dropping ${drop.category}: ${drop.paths.length} downloads`)
      const started = await ok<CopyStatus>('copy:start', { paths: drop.paths })
      recordHaul(started.haulId)

      let haul = started
      for (let tick = 0; haul.state === 'running'; tick++) {
        await pause(2000)
        haul = (await ok<{ haul: CopyStatus | null }>('copy:status')).haul ?? haul
        if (tick % 15 === 14) log(`  ${haul.landed}/${haul.total} landed`)
      }
      if (haul.state !== 'done') throw new Error(`The ${drop.category} haul stopped: ${haul.state}`)
      const s = haul.skipped
      log(
        `  ${haul.landed} landed of ${haul.total} PSDs; skipped ${s.duplicate} duplicate, ` +
          `${s.unreadable} unreadable, ${s.notPsd} not PSD, ${s.archiveUnsupported} unsupported archive, ` +
          `${s.noPsdInArchive} zip with no PSD`
      )
      if (haul.landed === 0) continue

      const proposal = await ok<GroupingProposal>('grouping:propose', { batchId: haul.haulId })
      await ok('grouping:confirm', confirmFromProposal(proposal))
      for (const g of proposal.groups) log(`  pile of ${g.members.length} (${g.reason})`)
      log(`  ${proposal.groups.length} piles, ${proposal.singletons.length} on their own`)
    }
  } finally {
    await app.close()
  }

  const db = new DatabaseSync(dbPath(), { readOnly: true })
  const ids = seededInboxIds(db)
  const noCover = db
    .prepare(
      `SELECT title FROM mockups WHERE cover_source = 'none' AND id IN (${ids.join(',') || 'NULL'})`
    )
    .all() as { title: string }[]
  db.close()
  log(`${ids.length} seeded mockups wait in To stash with their AI off.`)
  if (noCover.length > 0)
    log(`No cover, so they can't be stashed: ${noCover.map((r) => r.title).join(', ')}`)
  log(`The dev app's model is ${settings().activeModelId ?? 'none'}. Next: pnpm seed:dev suggest`)
}

// ── suggest ──────────────────────────────────────────────────────────────────────────────────

/** Mockups from the seed's hauls that are still in To sort or To stash. */
function seededInboxIds(db: DatabaseSync): number[] {
  const hauls = recordedHauls()
  if (hauls.length === 0) return []
  const rows = db
    .prepare(
      `SELECT id FROM mockups
        WHERE deleted_at IS NULL AND stage IN ('to_sort', 'to_stash')
          AND json_extract(import_context, '$.batchId') IN (${hauls.map(() => '?').join(',')})
        ORDER BY id`
    )
    .all(...hauls) as { id: number }[]
  return rows.map((r) => r.id)
}

function statusCounts(ids: number[]): Record<string, number> {
  const db = new DatabaseSync(dbPath(), { readOnly: true })
  const rows = db
    .prepare(
      `SELECT ai_status AS status, count(*) AS n FROM mockups WHERE id IN (${ids.join(',')}) GROUP BY ai_status`
    )
    .all() as { status: string; n: number }[]
  db.close()
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

function vectorCount(ids: number[]): number {
  const db = new DatabaseSync(dbPath(), { readOnly: true })
  const row = db
    .prepare(`SELECT count(*) AS n FROM mockup_embeddings WHERE mockup_id IN (${ids.join(',')})`)
    .get() as { n: number }
  db.close()
  return row.n
}

async function runSuggest(): Promise<void> {
  assertAppClosed()
  const db = new DatabaseSync(dbPath())
  const ids = seededInboxIds(db)
  if (ids.length === 0) {
    db.close()
    log('Nothing from the seed waits in the inbox.')
    return
  }
  db.prepare(
    `UPDATE mockups SET ai_status = 'pending' WHERE ai_status IN ('off', 'failed') AND id IN (${ids.join(',')})`
  ).run()
  db.close()
  log(`${ids.length} mockups queued for ${settings().activeModelId ?? 'no model'}.`)

  const { app, ok } = await launch()
  try {
    const started = Date.now()
    for (;;) {
      const counts = statusCounts(ids)
      const waiting = (counts.pending ?? 0) + (counts.sniffing ?? 0)
      const minutes = ((Date.now() - started) / 60_000).toFixed(1)
      log(`  ${minutes} min: ${JSON.stringify(counts)}`)
      if (waiting === 0) break
      await pause(30_000)
    }
    const counts = statusCounts(ids)
    if ((counts.ready ?? 0) === 0)
      throw new Error('No suggestion came back, so nothing was stashed.')

    const queue = await ok<LookOverQueue>('look-over:open')
    const seeded = new Set(ids)
    const stashed: number[] = []
    for (const unit of queue.units.filter((u) => seeded.has(u.unitId))) {
      const { channel, args } = stashCall(unit)
      const result = await ok<StashResult>(channel, args)
      const title = unit.items[0]?.title ?? String(unit.unitId)
      if (result.ok) stashed.push(...result.stashedIds)
      else log(`  Not stashed (${result.reason}): ${title}`)
    }
    log(`Stashed ${stashed.length} mockups. Waiting for meaning search's vectors.`)

    let had = -1
    for (let still = 0; still < 10; ) {
      const now = vectorCount(stashed)
      if (now === stashed.length) break
      still = now === had ? still + 1 : 0
      had = now
      log(`  ${now}/${stashed.length} vectors`)
      await pause(30_000)
    }
    log(
      `${vectorCount(stashed)}/${stashed.length} have a vector; the app catches up on the rest at launch.`
    )
  } finally {
    await app.close()
  }
}

// ── restore ──────────────────────────────────────────────────────────────────────────────────

function runRestore(dir: string | undefined): void {
  if (!dir || !existsSync(join(dir, 'backup.json')))
    throw new Error('Give the backup folder: tmp/dev-backup-<date>')
  assertAppClosed()
  const { userData, libraryRoot: root } = JSON.parse(
    readFileSync(join(dir, 'backup.json'), 'utf8')
  ) as {
    userData: string
    libraryRoot: string
  }
  // The live database's journal belongs to the seeded state; it must not meet the restored file.
  for (const name of DB_FILES) rmSync(join(root, name), { force: true })
  for (const name of DB_FILES) {
    if (existsSync(join(dir, name))) copyFileSync(join(dir, name), join(root, name))
  }
  copyFileSync(join(dir, 'settings.json'), join(userData, 'settings.json'))

  const atBackup = readFileSync(join(dir, 'mockups.txt'), 'utf8').split('\n').filter(Boolean)
  const mockupsDir = join(root, 'mockups')
  const extra = leftoverFolders(atBackup, existsSync(mockupsDir) ? readdirSync(mockupsDir) : [])
  for (const name of extra) rmSync(join(mockupsDir, name), { recursive: true, force: true })
  rmSync(HAULS_FILE, { force: true })
  log(`Restored the library from ${dir} and removed ${extra.length} mockup folders added since.`)
}

const [command, arg] = process.argv.slice(2)
const run =
  command === 'import'
    ? runImport()
    : command === 'suggest'
      ? runSuggest()
      : command === 'restore'
        ? Promise.resolve(runRestore(arg))
        : Promise.reject(new Error('Use: pnpm seed:dev import | suggest | restore <backup folder>'))
run.catch((err: unknown) => {
  console.error(`[seed] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
