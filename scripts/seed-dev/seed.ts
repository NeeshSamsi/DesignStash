/**
 * seed-dev: puts the DesignStash test set's real downloads in the dev app's stash, through the app's
 * own pipeline. The built app is launched on the dev userData and driven over its IPC channels, the
 * way e2e/fixtures/seed.ts drives it in a spec. Close the dev app and run `pnpm build` first.
 *
 *   pnpm seed:dev backup [label]    clone the whole library and settings (APFS clones, so 10 GB of
 *                                   mockups take no room) to tmp/dev-backup-<date>[-label], and check it.
 *   pnpm seed:dev empty <backup>    empty the library, once that backup still holds it.
 *   pnpm seed:dev model <id>        make an installed model the dev app's model.
 *   pnpm seed:dev import [--own <path>]...
 *                                   back up the database, then copy in, covers, masks and Sort's piles.
 *                                   No model runs. Each --own download is dropped first, as its own
 *                                   haul: a person's own mockups, kept through a seed from nothing.
 *   pnpm seed:dev suggest           the dev app's model writes every suggestion and names every pile's
 *                                   variations; then every pile and single is stashed with them,
 *                                   unedited, and meaning search's vectors are waited for. Writes the
 *                                   pushes it saw to tmp/dev-seed/events-<date>.json, and the report.
 *   pnpm seed:dev report [events]   the run's table, to tmp/dev-seed/run-<date>.md.
 *   pnpm seed:dev restore <backup>  put the library back as the backup has it.
 *
 * `import` drops one haul per category (zips, psds, folders, held-out, sign-off) and leaves out
 * `edge/`, `invalid/` and folders/Mixed Drop, which are generated. Run again, it adds only what is
 * missing: the copy queue skips a PSD whose content is already in the stash. During `import` the
 * dev app has no model (its `activeModelId` is put back after) and the Swift helper is pointed at
 * /usr/bin/false, so every new mockup lands with its AI marked off. `suggest` sets those back to
 * pending, and the app's queue picks them up at launch, as it does for fix-placeholder-covers.ts.
 * It opens Look it over at once, as a person would, so each pile's drafts are there and the pile is
 * named as soon as its last suggestion lands (design/specs/pile-titles.md). The hauls it made are
 * kept in tmp/dev-seed/hauls.json, so `suggest` touches nothing else in the inbox.
 *
 * DESIGNSTASH_USER_DATA and DESIGNSTASH_TEST_SET override the dev userData and the test set.
 * DESIGNSTASH_APP, set to a packaged DesignStash.app (`pnpm package` writes
 * dist/mac-arm64/DesignStash.app), drives that build instead of the repo's: its own binary with only
 * --user-data-dir, started from / as Finder starts it, so nothing reaches the repo by a relative path.
 * DESIGNSTASH_SEED_OUT moves everything the seed writes (logs, pushes, hauls, reports and backups)
 * from tmp/dev-seed and tmp/ into one folder, so a second run's record never meets the dev run's.
 */
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
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
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { LookOverQueue, StashResult } from '@shared/approval'
import type { GroupingProposal } from '@shared/grouping'
import type { CopyStatus } from '@shared/ipc/import'
import { fullTitle } from '@shared/pile-variation'
import { objectColourWords } from '../../src/main/ai/object-colour'
import { placeholderWordsIn } from '../../src/main/ai/placeholder-check'
import { DEV_USER_DATA } from '../../src/main/dev-user-data'
import { MODEL_FILE_NAMES, getModel } from '../../src/main/ai/registry'
import {
  aiRuns,
  backupProblems,
  confirmFromProposal,
  diskIsTight,
  freshBackupDir,
  leftoverFolders,
  pileRequests,
  repeatedWords,
  RESTART,
  seedDrops,
  stashCall,
  withOwnDrops,
  type LibraryShape,
  type RecordedEvent
} from './plan'

const REPO = process.cwd()
const USER_DATA = resolve(
  process.env.DESIGNSTASH_USER_DATA ?? join(homedir(), 'Library', 'Application Support', DEV_USER_DATA)
)
const TEST_SET = resolve(
  process.env.DESIGNSTASH_TEST_SET ?? join(homedir(), 'Downloads', 'DesignStash Test Set')
)
/** A packaged DesignStash.app to drive, or undefined for the repo's build. */
const PACKAGED_APP = process.env.DESIGNSTASH_APP ? resolve(process.env.DESIGNSTASH_APP) : undefined
const OUT = process.env.DESIGNSTASH_SEED_OUT ? resolve(process.env.DESIGNSTASH_SEED_OUT) : undefined
const SEED_DIR = OUT ?? join(REPO, 'tmp', 'dev-seed')
/** Where backups go: tmp/, beside tmp/dev-seed, or the output folder when there is one. */
const BACKUP_BASE = OUT ?? join(REPO, 'tmp')
const HAULS_FILE = join(SEED_DIR, 'hauls.json')
const today = () => new Date().toISOString().slice(0, 10)
const eventsFile = () => join(SEED_DIR, `events-${today()}.json`)
const DB_FILES = ['designstash.db', 'designstash.db-wal', 'designstash.db-shm']
const GB = 1024 ** 3

interface Settings {
  libraryRoot?: string
  activeModelId?: string | null
}

const settingsFile = () => join(USER_DATA, 'settings.json')

function settings(): Settings {
  return JSON.parse(readFileSync(settingsFile(), 'utf8')) as Settings
}

/** Change the dev app's settings while it is closed, keeping everything else in the file. */
function setSettings(patch: Settings): void {
  const all = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Record<string, unknown>
  writeFileSync(settingsFile(), JSON.stringify({ ...all, ...patch }, null, 2))
}

function libraryRoot(): string {
  return settings().libraryRoot ?? join(USER_DATA, 'Library')
}

const dbPath = () => join(libraryRoot(), 'designstash.db')
const log = (line: string) => console.log(`[seed] ${line}`)
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Stops here when anything has the library's database open: the dev app must be closed. */
function assertAppClosed(): void {
  // A fresh profile has no database yet, so nothing can have it open.
  if (!existsSync(dbPath())) return
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
  /** The pushes kept since the last call. */
  drain: () => Promise<RecordedEvent[]>
}

/** Pushes the seed keeps, in the window, for the report: the AI's progress and Look it over's drafts. */
const RECORDED = ['ai:status', 'look-over:draft']

/** How to start the app: the packaged binary from / (DESIGNSTASH_APP), or `electron .` in the repo. */
function launchTarget(): { executablePath?: string; args: string[]; cwd: string } {
  if (!PACKAGED_APP) return { args: ['.', `--user-data-dir=${USER_DATA}`], cwd: REPO }
  const executablePath = join(PACKAGED_APP, 'Contents', 'MacOS', 'DesignStash')
  if (!existsSync(executablePath)) throw new Error(`No packaged app at ${executablePath}.`)
  return { executablePath, args: [`--user-data-dir=${USER_DATA}`], cwd: '/' }
}

/**
 * The built app on the dev userData, as `pnpm start` runs it (or the packaged app, as Finder does),
 * never in test mode or with the stub AI. Its main process's output goes to
 * tmp/dev-seed/app-<command>.log, and the window starts keeping the pushes in RECORDED.
 */
async function launch(command: string, env: Record<string, string> = {}): Promise<Launched> {
  const base = { ...process.env }
  for (const key of ['NODE_ENV', 'DESIGNSTASH_E2E_STUB_AI', 'ELECTRON_RENDERER_URL'])
    delete base[key]
  const target = launchTarget()
  log(`Starting ${target.executablePath ?? 'the repo build'} on ${USER_DATA}.`)
  const app = await electron.launch({ ...target, env: { ...base, ...env } as Record<string, string> })
  mkdirSync(SEED_DIR, { recursive: true })
  const appLog = join(SEED_DIR, `app-${command}.log`)
  const keep = (chunk: Buffer | string) => appendFileSync(appLog, chunk)
  app.process().stdout?.on('data', keep)
  app.process().stderr?.on('data', keep)
  // How the app ends, said wherever it ends: a signal means something outside the app stopped it.
  const said = (line: string) => {
    log(line)
    keep(`[seed ${new Date().toISOString()}] ${line}\n`)
  }
  app.process().on('exit', (code, signal) => said(`The app's process ended: code ${code}, signal ${signal}.`))
  const window = await app.firstWindow()
  window.on('crash', () => said('The window\'s renderer crashed.'))
  window.on('close', () => said('The window closed.'))
  window.on('pageerror', (err) => said(`Page error: ${err.message}`))
  window.on('console', (msg) => {
    if (msg.type() === 'error') keep(`[renderer ${new Date().toISOString()}] ${msg.text()}\n`)
  })
  await window.waitForLoadState('domcontentloaded')
  await window.waitForFunction(() => 'api' in window)
  await window.evaluate((channels) => {
    const w = window as unknown as {
      __seed: { at: number; channel: string; payload: unknown }[]
      api: { subscribe: (c: string, cb: (p: unknown) => void) => () => void }
    }
    w.__seed = []
    for (const channel of channels) w.api.subscribe(channel, (payload) => w.__seed.push({ at: Date.now(), channel, payload }))
  }, RECORDED)
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
  const drain = () =>
    window.evaluate(() => {
      const w = window as unknown as { __seed: RecordedEvent[] }
      return w.__seed.splice(0)
    })
  // The library must have opened, or none of its channels are there.
  await ok('inbox:get-counts')
  // Marker for whoever holds the better-sqlite3 lock: the native module is loaded now.
  log('App is up.')
  return { app, window, ok, drain }
}

// ── backup, empty, model ─────────────────────────────────────────────────────────────────────

/** A library's mockups, mockup folders and database check, or null when its database won't open. */
function shapeOf(root: string): LibraryShape | null {
  try {
    const db = new DatabaseSync(join(root, 'designstash.db'), { readOnly: true })
    const quickCheck = (db.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check
    const mockups = (db.prepare('SELECT count(*) AS n FROM mockups').get() as { n: number }).n
    db.close()
    const dir = join(root, 'mockups')
    return { mockups, folders: existsSync(dir) ? readdirSync(dir) : [], quickCheck }
  } catch {
    return null
  }
}

/** The whole library and settings, cloned: APFS clones share the 10 GB of mockups until either side changes. */
function runBackup(label: string | undefined): void {
  assertAppClosed()
  const root = libraryRoot()
  const dir = freshBackupDir(BACKUP_BASE, new Date(), existsSync, label)
  mkdirSync(dir, { recursive: true })
  execFileSync('cp', ['-c', '-R', root, join(dir, 'Library')])
  copyFileSync(settingsFile(), join(dir, 'settings.json'))
  writeFileSync(join(dir, 'backup.json'), JSON.stringify({ userData: USER_DATA, libraryRoot: root, full: true, at: new Date().toISOString() }, null, 2))
  const live = shapeOf(root)
  const problems = live ? backupProblems(live, shapeOf(join(dir, 'Library'))) : ['the library itself does not open']
  if (problems.length > 0) throw new Error(`The backup in ${dir} can't stand in for the library: ${problems.join('; ')}`)
  log(`Backed up the whole library (${live!.mockups} mockups, ${live!.folders.length} folders) to ${dir}, and it opens.`)
}

interface BackupInfo {
  userData: string
  libraryRoot: string
  /** A clone of the whole library (`backup`), or only its database (`import`'s own). */
  full?: boolean
}

const backupInfo = (dir: string): BackupInfo => JSON.parse(readFileSync(join(dir, 'backup.json'), 'utf8')) as BackupInfo

/** An empty library, for a seed from nothing. Only once a whole backup still holds the library as it is. */
function runEmpty(dir: string | undefined): void {
  if (!dir || !existsSync(join(dir, 'backup.json'))) throw new Error('Give the backup folder: tmp/dev-backup-<date>-<label>')
  assertAppClosed()
  const info = backupInfo(dir)
  const root = libraryRoot()
  if (!info.full || info.libraryRoot !== root) throw new Error(`${dir} isn't a whole backup of ${root}.`)
  const live = shapeOf(root)
  const problems = live ? backupProblems(live, shapeOf(join(dir, 'Library'))) : []
  if (problems.length > 0) throw new Error(`The library changed since ${dir}, so it stays as it is: ${problems.join('; ')}`)
  for (const name of readdirSync(root)) rmSync(join(root, name), { recursive: true, force: true })
  rmSync(HAULS_FILE, { force: true })
  log(`Emptied ${root}. ${dir} brings it back: pnpm seed:dev restore ${dir}`)
}

/** Make a model the dev app's own, once its files are installed as the catalog has them. */
function runModel(id: string | undefined): void {
  const entry = id ? getModel(id) : undefined
  if (!entry) throw new Error('Give a model id from the catalog, such as qwen3.5-9b.')
  assertAppClosed()
  if (entry.files) {
    const dir = join(USER_DATA, 'models', entry.id)
    for (const [key, file] of Object.entries(entry.files) as [keyof typeof MODEL_FILE_NAMES, { sizeBytes: number }][]) {
      const path = join(dir, MODEL_FILE_NAMES[key])
      if (!existsSync(path) || statSync(path).size !== file.sizeBytes) throw new Error(`${entry.name} isn't installed: ${path} is missing or not ${file.sizeBytes} bytes.`)
    }
    const parts = readdirSync(dir).filter((n) => n.endsWith('.part'))
    if (parts.length > 0) throw new Error(`${dir} still has a download part: ${parts.join(', ')}`)
  }
  setSettings({ activeModelId: entry.id })
  log(`The dev app's model is now ${entry.name}.`)
}

// ── import ───────────────────────────────────────────────────────────────────────────────────

function backUp(): string {
  const dir = freshBackupDir(BACKUP_BASE, new Date(), existsSync)
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

/** `own`: downloads to drop first, each as its own haul (`--own <path>`, as many as wanted). */
async function runImport(own: string[]): Promise<void> {
  if (!existsSync(join(TEST_SET, 'MANIFEST.md'))) throw new Error(`No test set at ${TEST_SET}.`)
  assertAppClosed()
  const drops = withOwnDrops(
    seedDrops(TEST_SET, (dir) => (existsSync(dir) ? readdirSync(dir) : [])),
    own
  )
  for (const path of own) if (!existsSync(path)) throw new Error(`Nothing at ${path} to drop.`)

  const needed = drops.flatMap((d) => d.paths).reduce((sum, p) => sum + sizeOf(p), 0)
  const st = statfsSync(libraryRoot())
  const free = st.bavail * st.bsize
  log(`Disk: ${(free / GB).toFixed(1)} GB free, the drops are ${(needed / GB).toFixed(1)} GB.`)
  if (diskIsTight(free, needed)) throw new Error('Not enough free disk space for the seed.')

  if (existsSync(dbPath())) log(`Backed up the library's database to ${backUp()}`)
  else log('The library is empty: nothing to back up.')

  // No model writes during the import: the mockups land with their AI off, for `suggest`.
  const model = settings().activeModelId ?? null
  setSettings({ activeModelId: null })
  const { app, ok } = await launch('import', { DESIGNSTASH_HELPER: '/usr/bin/false' }).catch((err: unknown) => {
    setSettings({ activeModelId: model })
    throw err
  })
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
    setSettings({ activeModelId: model })
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

/**
 * Whether the dev app's model is answering a request right now: the chat llama-server (the one with
 * an image projector) by its /slots, or by its CPU when /slots won't say. Null when none is running
 * (Apple's model, or none loaded).
 */
async function modelBusy(): Promise<boolean | null> {
  const line = execFileSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' })
    .split('\n')
    .find((l) => l.includes('llama-server') && l.includes('--mmproj'))
  if (!line) return null
  const port = /--port (\d+)/.exec(line)?.[1]
  try {
    const slots = (await (await fetch(`http://127.0.0.1:${port}/slots`)).json()) as { is_processing?: boolean }[]
    if (Array.isArray(slots)) return slots.some((slot) => slot.is_processing)
  } catch {
    // Falls through to the CPU.
  }
  const pid = line.trim().split(/\s+/)[0]!
  return Number(execFileSync('ps', ['-o', '%cpu=', '-p', pid], { encoding: 'utf8' }).trim()) > 20
}

/** The pushes kept so far, with when the model went quiet, for `report`. */
interface EventsFile {
  model: string | null
  startedAt: number
  idleAt: number | null
  events: RecordedEvent[]
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
  const model = settings().activeModelId ?? null
  log(`${ids.length} mockups queued for ${model ?? 'no model'}.`)

  const { app, ok, drain } = await launch('suggest')
  // A second suggest the same day carries on today's record, marking where the app came back.
  const record: EventsFile = existsSync(eventsFile())
    ? { ...(JSON.parse(readFileSync(eventsFile(), 'utf8')) as EventsFile), idleAt: null }
    : { model, startedAt: Date.now(), idleAt: null, events: [] }
  record.events.push({ at: Date.now(), channel: RESTART, payload: null })
  const save = async () => {
    record.events.push(...(await drain()))
    writeFileSync(eventsFile(), JSON.stringify(record))
  }
  try {
    // The catalog must have the model installed, as Settings shows it, with nothing half downloaded.
    const { models, activeProblem } = await ok<{
      models: { id: string; installed: boolean; active: boolean; downloadedBytes: number }[]
      activeProblem: unknown
    }>('ai:list-models')
    const active = models.find((m) => m.active)
    log(`Catalog: ${active ? `${active.id}, installed ${active.installed}` : 'no active model'}${activeProblem ? `, problem ${JSON.stringify(activeProblem)}` : ''}`)
    if (!active?.installed || activeProblem) throw new Error('The dev app has no installed model to write with.')
    // Look it over opens as a person would: the drafts are made, so each pile is named as soon as
    // its last suggestion lands, and the mockup it opens on goes first.
    await ok<LookOverQueue>('look-over:open')
    let quiet = 0
    for (let tick = 0; ; tick++) {
      await save()
      const counts = statusCounts(ids)
      const waiting = (counts.pending ?? 0) + (counts.sniffing ?? 0)
      if (tick % 3 === 0) log(`  ${((Date.now() - record.startedAt) / 60_000).toFixed(1)} min: ${JSON.stringify(counts)}`)
      // Every suggestion is in; the last piles' variations come after, so wait until the model is quiet.
      const busy = waiting === 0 ? await modelBusy() : true
      quiet = busy ? 0 : quiet + 1
      if (quiet === 1) record.idleAt = Date.now()
      if (quiet >= 3) break
      await pause(10_000)
    }
    await save()
    const counts = statusCounts(ids)
    log(`Every suggestion is in, and the model is quiet: ${JSON.stringify(counts)}`)
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
    await save()
  } finally {
    await app.close()
  }
  runReport(eventsFile())
}

// ── report ───────────────────────────────────────────────────────────────────────────────────

interface Row {
  id: number
  title: string
  description: string | null
  variation: string | null
  variation_source: string | null
  is_group: number
  group_id: number | null
  ai_status: string
  stage: string
  file: string | null
  tags: string | null
}

const seconds = (ms: number | null | undefined) => (ms == null ? '' : (ms / 1000).toFixed(1))
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** The run's table: each pile's base and variations, the singles' titles, the AI's times and what to check. */
function runReport(file: string | undefined): void {
  const recorded: EventsFile = file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as EventsFile) : { model: null, startedAt: 0, idleAt: null, events: [] }
  const hauls = recordedHauls()
  if (hauls.length === 0) throw new Error('No seed hauls are recorded, so there is nothing to report.')
  const db = new DatabaseSync(dbPath(), { readOnly: true })
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.description, m.variation, m.variation_source, m.is_group, m.group_id, m.ai_status, m.stage,
              json_extract(m.import_context, '$.originalFilename') AS file,
              (SELECT group_concat(t.label, ', ') FROM mockup_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.mockup_id = m.id) AS tags
         FROM mockups m
        WHERE m.deleted_at IS NULL AND json_extract(m.import_context, '$.batchId') IN (${hauls.map(() => '?').join(',')})
        ORDER BY m.id`
    )
    .all(...hauls) as unknown as Row[]
  db.close()

  const runs = aiRuns(recorded.events)
  const runOf = new Map(runs.map((r) => [r.mockupId, r]))
  const tops = rows.filter((r) => r.is_group)
  const piles = new Map(tops.map((t) => [t.id, [t.id, ...rows.filter((r) => r.group_id === t.id).map((r) => r.id)]]))
  const restarts = recorded.events.filter((e) => e.channel === RESTART).map((e) => e.at)
  const requests = new Map(pileRequests(runs, piles, recorded.idleAt, restarts).map((p) => [p.pileId, p.ms]))
  const byId = new Map(rows.map((r) => [r.id, r]))

  const flagsOf = (r: Row): string[] => {
    const tags = r.tags ? r.tags.split(', ') : []
    const answer = { title: fullTitle(r.title, r.variation ? { words: r.variation } : null), description: r.description ?? '' }
    const colours = objectColourWords(answer, tags)
    const words = placeholderWordsIn({ ...answer, tags: tags.map((label) => ({ category: '', label })) })
    return [...(colours.length ? [`object colour: ${colours.join(', ')}`] : []), ...(words.length ? [`check: ${words.join(', ')}`] : [])]
  }

  const out: string[] = []
  const slow = runs.filter((r) => r.slow)
  const hardStops = runs.filter((r) => r.hardStop)
  const couldnt = runs.filter((r) => r.status === 'failed' && !r.hardStop)
  const runMs = runs.filter((r) => r.status === 'ready').map((r) => r.ms)
  const pileMs = [...requests.values()].filter((v): v is number => v !== null)
  out.push(`# ${PACKAGED_APP ? 'Packaged' : 'Dev'} seed run, ${today()}`, '')
  out.push(`App: ${PACKAGED_APP ?? 'the repo build'}. Model: ${recorded.model ?? 'unknown'}. ${rows.length} mockups: ${tops.length} piles and ${rows.filter((r) => !r.is_group && r.group_id === null).length} on their own.`, '')
  const relaunches = restarts.filter((at) => at - recorded.startedAt > 5_000).length
  if (relaunches > 0) out.push(`The app was launched again ${relaunches} time${relaunches === 1 ? '' : 's'} during the run; a run or pile request cut off by that isn't timed.`, '')
  out.push('## Counts', '')
  out.push(`- Suggestions timed: ${runs.length}; ready ${runMs.length}.`)
  out.push(`- Taking a while (past the slow threshold): ${slow.length}${slow.length ? ` (${slow.map((r) => `#${r.mockupId}`).join(', ')})` : ''}.`)
  out.push(`- Hard stops: ${hardStops.length}${hardStops.length ? ` (${hardStops.map((r) => `#${r.mockupId}`).join(', ')})` : ''}.`)
  out.push(`- Couldn't write: ${couldnt.length}${couldnt.length ? ` (${couldnt.map((r) => `#${r.mockupId}`).join(', ')})` : ''}.`)
  out.push(`- Time per mockup: median ${seconds(median(runMs))} s, longest ${seconds(runMs.length ? Math.max(...runMs) : null)} s.`)
  out.push(`- Time per pile request (about): median ${seconds(median(pileMs))} s, longest ${seconds(pileMs.length ? Math.max(...pileMs) : null)} s, over ${pileMs.length} of ${tops.length} piles.`)
  const slowAfter = runs.find((r) => r.slowAfterMs !== null)?.slowAfterMs
  if (slowAfter) out.push(`- Slow threshold at the start: ${seconds(slowAfter)} s.`)
  out.push('')

  out.push('## Piles', '')
  for (const top of tops) {
    const members = piles.get(top.id)!.map((id) => byId.get(id)!)
    const repeats = repeatedWords(members.map((m) => m.variation))
    out.push(`### ${cell(top.title)} (#${top.id}, ${members.length} mockups, request about ${seconds(requests.get(top.id)) || '?'} s)`, '')
    if (repeats.length) out.push(`Repeated variation: ${repeats.join(', ')}`, '')
    out.push('| # | File | Variation | Source | Time (s) | Description | Tags | Flags |', '|---|---|---|---|---|---|---|---|')
    for (const m of members) {
      out.push(`| ${m.id} | ${cell(m.file ?? '')} | ${cell(m.variation ?? '')} | ${m.variation_source ?? ''} | ${seconds(runOf.get(m.id)?.ms)} | ${cell(m.description ?? '')} | ${cell(m.tags ?? '')} | ${cell(flagsOf(m).join('; '))} |`)
    }
    out.push('')
  }

  out.push('## On their own', '')
  out.push('| # | File | Title | Time (s) | Description | Tags | Flags |', '|---|---|---|---|---|---|---|')
  for (const m of rows.filter((r) => !r.is_group && r.group_id === null)) {
    out.push(`| ${m.id} | ${cell(m.file ?? '')} | ${cell(m.title)} | ${seconds(runOf.get(m.id)?.ms)} | ${cell(m.description ?? '')} | ${cell(m.tags ?? '')} | ${cell(flagsOf(m).join('; '))} |`)
  }
  out.push('')
  const notStashed = rows.filter((r) => r.stage !== 'stashed')
  if (notStashed.length) out.push(`Not stashed: ${notStashed.map((r) => `#${r.id} ${r.file ?? r.title} (${r.ai_status})`).join(', ')}`, '')

  const path = join(SEED_DIR, `run-${today()}.md`)
  writeFileSync(path, out.join('\n'))
  log(`Wrote ${path}.`)
}

// ── restore ──────────────────────────────────────────────────────────────────────────────────

function runRestore(dir: string | undefined): void {
  if (!dir || !existsSync(join(dir, 'backup.json')))
    throw new Error('Give the backup folder: tmp/dev-backup-<date>')
  assertAppClosed()
  const { userData, libraryRoot: root, full } = backupInfo(dir)
  if (full) {
    // A whole backup comes back whole: the library as it was, folder for folder, cloned again.
    rmSync(root, { recursive: true, force: true })
    execFileSync('cp', ['-c', '-R', join(dir, 'Library'), root])
    copyFileSync(join(dir, 'settings.json'), join(userData, 'settings.json'))
    rmSync(HAULS_FILE, { force: true })
    log(`Restored the whole library from ${dir}.`)
    return
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

/** The paths after each `--own`. */
function ownPaths(args: string[]): string[] {
  return args.flatMap((a, i) => (args[i - 1] === '--own' ? [a] : []))
}
const commands: Record<string, () => Promise<void> | void> = {
  backup: () => runBackup(arg),
  empty: () => runEmpty(arg),
  model: () => runModel(arg),
  import: () => runImport(ownPaths(process.argv.slice(3))),
  suggest: runSuggest,
  report: () => runReport(arg ?? eventsFile()),
  restore: () => runRestore(arg)
}
const chosen = command ? commands[command] : undefined
const run = chosen
  ? Promise.resolve().then(chosen)
  : Promise.reject(new Error('Use: pnpm seed:dev backup [label] | empty <backup> | model <id> | import [--own <path>]... | suggest | report [events] | restore <backup>'))
run.catch((err: unknown) => {
  console.error(`[seed] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
